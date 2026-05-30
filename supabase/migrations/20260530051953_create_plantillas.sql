-- Migration: create plantillas (stored WhatsApp message templates) with RLS.
-- Issue #6 — retención: plantillas table + converge both WhatsApp builders.
-- Owner-scoped to (select auth.uid()); one body per (user_id, clave).

create table public.plantillas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  clave text not null,
  body text not null,
  created_at timestamptz not null default now(),
  unique (user_id, clave)
);

alter table public.plantillas enable row level security;

create policy "plantillas owner select" on public.plantillas
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "plantillas owner insert" on public.plantillas
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "plantillas owner update" on public.plantillas
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
