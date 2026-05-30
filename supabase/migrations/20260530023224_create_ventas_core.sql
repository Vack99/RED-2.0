-- Ventas tracer-bullet core: clientes, paquetes, ventas (+ folio sequence).
-- Applied to project hjppxawglmukfvsgmcog via Supabase MCP (migration 20260530023224).
-- RLS on every table, owner-scoped to (select auth.uid()) (ADR-0001).

-- ── clientes: roster + stored running-balance saldo ──────────────────────────
-- ADR-0004 (extends ADR-0002): `vence` + `clases_restantes` are a STORED running
-- balance (mutated transactionally by sales/attendance) because stacking is
-- path-dependent; estado/diasRest stay derived at read.
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nombre text not null,
  tel text not null,
  clases_restantes int,                 -- NULL = ilimitado
  vence date,                           -- stored running expiry (stacked)
  paquete_nombre text,                  -- active package label (display snapshot)
  created_at timestamptz not null default now()
);
alter table public.clientes enable row level security;
create policy "clientes_select_own" on public.clientes for select to authenticated using ((select auth.uid()) = user_id);
create policy "clientes_insert_own" on public.clientes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "clientes_update_own" on public.clientes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ── paquetes: per-operator catalog ───────────────────────────────────────────
create table if not exists public.paquetes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nombre text not null,
  clases int,                           -- NULL = ilimitado
  vigencia_tipo text not null default 'dias' check (vigencia_tipo in ('dias','mes')),
  vigencia_dias int,                    -- NULL when vigencia_tipo = 'mes'
  precio int not null,
  popular boolean not null default false,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  constraint paquetes_vigencia_ck check ((vigencia_tipo = 'mes') = (vigencia_dias is null)),
  constraint paquetes_nombre_uq unique (user_id, nombre)
);
alter table public.paquetes enable row level security;
create policy "paquetes_select_own" on public.paquetes for select to authenticated using ((select auth.uid()) = user_id);
create policy "paquetes_insert_own" on public.paquetes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "paquetes_update_own" on public.paquetes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ── ventas: sales ledger (DB-generated folio) ────────────────────────────────
create sequence if not exists public.venta_folio_seq start 1001;
grant usage, select on sequence public.venta_folio_seq to authenticated;

create table if not exists public.ventas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  folio bigint not null default nextval('public.venta_folio_seq'),
  paquete_nombre text not null,
  clases int,                           -- snapshot; NULL = ilimitado
  vigencia_tipo text not null check (vigencia_tipo in ('dias','mes')),
  vigencia_dias int,
  monto int not null,
  metodo text not null check (metodo in ('efectivo','transferencia','tarjeta','pendiente')),
  fecha timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint ventas_folio_uq unique (folio)
);
alter table public.ventas enable row level security;
create policy "ventas_select_own" on public.ventas for select to authenticated using ((select auth.uid()) = user_id);
create policy "ventas_insert_own" on public.ventas for insert to authenticated with check ((select auth.uid()) = user_id);
