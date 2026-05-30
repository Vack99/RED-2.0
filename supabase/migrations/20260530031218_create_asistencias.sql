-- asistencias: one row per attendance, absolute America/Chihuahua date (ADR-0003),
-- soft-deletable. `consumio` records whether this attendance actually decremented a
-- class, so undo restores exactly one class (never a free one at 0 / ilimitado).
-- Applied to project hjppxawglmukfvsgmcog via Supabase MCP (migration 20260530031218).
create table if not exists public.asistencias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  fecha date not null,
  hora time,                                 -- check-in time (Chihuahua-local); null for back-entry
  consumio boolean not null default false,   -- did this attendance take a class off the saldo?
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.asistencias enable row level security;
create policy "asistencias_select_own" on public.asistencias for select to authenticated using ((select auth.uid()) = user_id);
create policy "asistencias_insert_own" on public.asistencias for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "asistencias_update_own" on public.asistencias for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index if not exists asistencias_user_fecha_idx on public.asistencias (user_id, fecha) where deleted_at is null;
create index if not exists asistencias_cliente_fecha_idx on public.asistencias (cliente_id, fecha) where deleted_at is null;
