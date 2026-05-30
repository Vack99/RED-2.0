-- Migration: create cobro (operator payment/transfer details) with RLS.
-- Issue #7 — feeds the {datos_pago} plantilla token. One row per operator.
-- Owner-scoped to (select auth.uid()) (ADR-0001).

create table public.cobro (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  titular text,
  banco text,
  clabe text,
  tarjeta text,
  acepta_efectivo boolean not null default true,
  acepta_transferencia boolean not null default true,
  acepta_tarjeta boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.cobro enable row level security;

create policy "cobro owner select" on public.cobro
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "cobro owner insert" on public.cobro
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "cobro owner update" on public.cobro
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
