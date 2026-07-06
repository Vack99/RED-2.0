-- Gym contact details, slice #53 (PRD #49 S1; ADR-0013 curated/showcased class; ADR-0002 derived-not-stored).
--
-- The public Contacto page's data home. One row per gym (gym_id is the PK — a 1:1 satellite of `gym`,
-- unlike the 1:N gym_content sections). It stores the marketing contact facts the mock renders: the
-- street address + a free-text locator note, the map pin as latitude/longitude (the coords label and the
-- "abrir en mapas" URL are DERIVED at the render site — ADR-0002, never stored), the three direct
-- channels (whatsapp as E.164 digits, email, instagram handle without '@'), and the weekly hours as a
-- jsonb array (one bounded 7-row structure the page reads whole; a satellite table would be unearned
-- structure for a fixed weekly block — "reject unneeded structure"). Every field is nullable so a gym
-- with partial (or no) contact info renders its empty states gracefully.
--
-- RLS is the curated/showcased class (ADR-0013 §3), replayed byte-for-byte from gym_content
-- (20260706150000_create_gym_content) AND the anon widening from #50
-- (20260706160000_phase6_anon_catalog_read): authenticated members read via is_member_of(gym_id); staff
-- write (insert/update/delete) via is_staff_of(gym_id); anon reads (`to anon using (true)`) because the
-- contact page is a PUBLIC marketing surface read over the cookieless anon client — the same conscious
-- "this is public" decision the catalog carries, extended to the contact data the Contacto page needs.
-- Per-gym scoping stays a QUERY concern (the marketing DAL filters `.eq('gym_id', …)`); the anon policy
-- is flat across gyms by design (hostnames are public; the page picks its gym). Every helper call uses
-- the `(select …)` initplan idiom (ADR-0001/§2). gym_id is the PK so it is already indexed.
--
-- Expand-only: one brand-new table, no existing object touched. `rls_auto_enable` also fires on CREATE
-- TABLE, but RLS is enabled explicitly here too (belt-and-suspenders, matches the gym_content precedent).
-- Idempotent (create-if-not-exists + drop-policy-if-exists) so it is safe to re-apply and safe
-- out-of-order on the live project.

create table if not exists public.gym_contact (
  gym_id       uuid primary key references public.gym (id) on delete cascade,
  address_line text check (address_line is null or char_length(address_line) between 1 and 200),
  address_note text check (address_note is null or char_length(address_note) between 1 and 400),
  latitude     numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  longitude    numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  whatsapp     text check (whatsapp is null or whatsapp ~ '^[0-9]{8,15}$'),         -- E.164 digits, no punctuation
  email        text check (email is null or char_length(email) between 3 and 160),
  instagram    text check (instagram is null or char_length(instagram) between 1 and 60),  -- handle, no '@'
  hours        jsonb not null default '[]'::jsonb,                                   -- [{day,opens,closes} | {day,closed:true}]
  updated_at   timestamptz not null default now()
);
alter table public.gym_contact enable row level security;

drop policy if exists "gym_contact_member_select" on public.gym_contact;
create policy "gym_contact_member_select" on public.gym_contact for select to authenticated
  using ((select public.is_member_of(gym_id)));
drop policy if exists "gym_contact_anon_select" on public.gym_contact;
create policy "gym_contact_anon_select" on public.gym_contact for select to anon
  using (true);
drop policy if exists "gym_contact_staff_insert" on public.gym_contact;
create policy "gym_contact_staff_insert" on public.gym_contact for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));
drop policy if exists "gym_contact_staff_update" on public.gym_contact;
create policy "gym_contact_staff_update" on public.gym_contact for update to authenticated
  using ((select public.is_staff_of(gym_id))) with check ((select public.is_staff_of(gym_id)));
drop policy if exists "gym_contact_staff_delete" on public.gym_contact;
create policy "gym_contact_staff_delete" on public.gym_contact for delete to authenticated
  using ((select public.is_staff_of(gym_id)));
