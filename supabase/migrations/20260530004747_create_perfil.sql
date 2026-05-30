-- Single-operator gym profile. One row per authenticated operator.
-- Stored facts only (ADR-0002): negocio brand (stored once = 'FORGE'), coach, tel, ciudad.
-- Applied to project hjppxawglmukfvsgmcog via Supabase MCP (migration 20260530004747).
create table if not exists public.perfil (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  negocio text not null default 'FORGE',
  coach text,
  tel text,
  ciudad text,
  created_at timestamptz not null default now()
);

-- RLS is the primary security boundary (ADR-0001): enabled + owner-scoped to (select auth.uid()).
alter table public.perfil enable row level security;

create policy "perfil_select_own"
  on public.perfil for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "perfil_insert_own"
  on public.perfil for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "perfil_update_own"
  on public.perfil for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
