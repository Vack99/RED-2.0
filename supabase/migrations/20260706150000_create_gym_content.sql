-- Gym content schema, slice #39 (PRD #36 S3; ADR-0013 curated/showcased class).
--
-- Four new gym_id-scoped tables the Phase-6 client app's nosotros/marketing pages will render, so the
-- operator authors "acerca de" content instead of it being hardcoded: `about_value` (the gym's values,
-- e.g. "Comunidad" / "Disciplina"), `facility` (instalaciones, e.g. "Área de pesas"), `stat` (a
-- marketing stat pair, e.g. "Miembros activos" / "500+" — kept as free-text `value` so the operator can
-- write "500+" or "10 años" without a formatting layer), and `faq` (pregunta/respuesta pairs). Each row
-- carries `sort_order` for the operator's own display order (append-then-reorder, never a hidden
-- default order).
--
-- RLS is the curated/showcased class (ADR-0013 §3), replayed byte-for-byte from the paquetes/perfil/
-- plantillas precedent (20260702173309_gym_scoped_rls_policies.sql): authenticated members read via
-- is_member_of(gym_id); staff write (insert/update/delete) via is_staff_of(gym_id). No anon policy —
-- anon-read is DEFERRED to Phase 6 (PRD #36 decision b), where it lands with the marketing pages that
-- consume it. Every helper call uses the `(select …)` initplan idiom (ADR-0001/§2 — once per statement,
-- not per row); gym_id is indexed on every table (ADR-0013 §2).
--
-- Expand-only: four brand-new tables, no existing object touched. `rls_auto_enable` also fires on
-- CREATE TABLE, but RLS is enabled explicitly here too (belt-and-suspenders, matches the
-- gym_membership/catalog-spine precedent). No branded ids: these four tables are NOT in the PRD's named
-- present-need list for branded ids (decision l lists coach/class_type/class_session/schedule_template/
-- room only) — plain uuid strings, per the "reject unneeded structure" design principle.

-- ── about_value: the gym's values (marketing "quiénes somos" cards) ────────────────────────────────
create table public.about_value (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gym (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 60),
  description text not null check (char_length(description) between 1 and 400),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index about_value_gym_id_idx on public.about_value (gym_id);
alter table public.about_value enable row level security;

drop policy if exists "about_value_member_select" on public.about_value;
create policy "about_value_member_select" on public.about_value for select to authenticated
  using ((select public.is_member_of(gym_id)));
drop policy if exists "about_value_staff_insert" on public.about_value;
create policy "about_value_staff_insert" on public.about_value for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));
drop policy if exists "about_value_staff_update" on public.about_value;
create policy "about_value_staff_update" on public.about_value for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));
drop policy if exists "about_value_staff_delete" on public.about_value;
create policy "about_value_staff_delete" on public.about_value for delete to authenticated
  using ((select public.is_staff_of(gym_id)));

-- ── facility: instalaciones (marketing gallery cards) ──────────────────────────────────────────────
create table public.facility (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gym (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  description text not null check (char_length(description) between 1 and 400),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index facility_gym_id_idx on public.facility (gym_id);
alter table public.facility enable row level security;

drop policy if exists "facility_member_select" on public.facility;
create policy "facility_member_select" on public.facility for select to authenticated
  using ((select public.is_member_of(gym_id)));
drop policy if exists "facility_staff_insert" on public.facility;
create policy "facility_staff_insert" on public.facility for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));
drop policy if exists "facility_staff_update" on public.facility;
create policy "facility_staff_update" on public.facility for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));
drop policy if exists "facility_staff_delete" on public.facility;
create policy "facility_staff_delete" on public.facility for delete to authenticated
  using ((select public.is_staff_of(gym_id)));

-- ── stat: a marketing stat pair (label + free-text value, e.g. "Miembros activos" / "500+") ────────
create table public.stat (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gym (id) on delete cascade,
  label       text not null check (char_length(label) between 1 and 60),
  value       text not null check (char_length(value) between 1 and 30),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index stat_gym_id_idx on public.stat (gym_id);
alter table public.stat enable row level security;

drop policy if exists "stat_member_select" on public.stat;
create policy "stat_member_select" on public.stat for select to authenticated
  using ((select public.is_member_of(gym_id)));
drop policy if exists "stat_staff_insert" on public.stat;
create policy "stat_staff_insert" on public.stat for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));
drop policy if exists "stat_staff_update" on public.stat;
create policy "stat_staff_update" on public.stat for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));
drop policy if exists "stat_staff_delete" on public.stat;
create policy "stat_staff_delete" on public.stat for delete to authenticated
  using ((select public.is_staff_of(gym_id)));

-- ── faq: pregunta/respuesta pairs ──────────────────────────────────────────────────────────────────
create table public.faq (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gym (id) on delete cascade,
  question    text not null check (char_length(question) between 1 and 200),
  answer      text not null check (char_length(answer) between 1 and 1000),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index faq_gym_id_idx on public.faq (gym_id);
alter table public.faq enable row level security;

drop policy if exists "faq_member_select" on public.faq;
create policy "faq_member_select" on public.faq for select to authenticated
  using ((select public.is_member_of(gym_id)));
drop policy if exists "faq_staff_insert" on public.faq;
create policy "faq_staff_insert" on public.faq for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));
drop policy if exists "faq_staff_update" on public.faq;
create policy "faq_staff_update" on public.faq for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));
drop policy if exists "faq_staff_delete" on public.faq;
create policy "faq_staff_delete" on public.faq for delete to authenticated
  using ((select public.is_staff_of(gym_id)));
