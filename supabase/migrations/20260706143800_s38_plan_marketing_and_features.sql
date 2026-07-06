-- S2 / slice #38 — evolve `paquetes` in place into the public plan catalog (PRD #36 decision (a);
-- ADR-0005 atomic-write seam, ADR-0007 derived-nombre, ADR-0013 curated class). EXPAND-ONLY.
--
-- BINDING per-column map (a): the money/grant truth is REUSED, never duplicated —
--   • `clases`  IS the class quota (NULL = ilimitado; `paquetes_clases_ck`; `consumirClase` guard).
--   • `popular` IS the featured flag (per-gym `paquetes_one_popular` invariant).
--   • `precio`  IS the price (whole pesos, the `registrar_venta` money path).
-- Adding class_quota / is_unlimited / is_featured / price_cents is a GATE FAILURE — a tripwire at the
-- foot of this file raises if any ever appear.
--
-- This file ADDS ONLY: the marketing-only scalar columns (`code`,`name`,`subtitle`,`badge`,`cadence`)
-- + the `plan_feature` child table + two authoring RPCs. `nombre` stays DERIVED (ADR-0007) — `name` is a
-- SEPARATE free-text marketing string and never feeds `crearVenta`/the receipt. NO policy change to
-- `paquetes` (member read shipped Phase 3); the live vender/saldo/stacking flow is UNTOUCHED (it reads a
-- fixed column list that excludes every column added here). RLS for the new table lands in the SIBLING
-- policy migration (…_s38_plan_feature_policies) — this file leaves plan_feature RLS-enabled-but-deny-all
-- (the rls_auto_enable trigger + explicit enable), which is the RED baseline the denial suite proves.
--
-- Idempotent (add-column-if-not-exists · guarded add-constraint · create-if-not-exists) and additive, so
-- it is safe to re-apply and safe out-of-order on the live project alongside sibling Phase-5 slices.

-- ── 1. Marketing-only scalar columns on paquetes (all nullable; display copy only) ────────────────
-- `name`/`subtitle`/`badge`/`cadence` are free-text display strings distinct from the grant-derived
-- `nombre`. `code` is a per-gym stable handle (Phase-3 re-key pattern) — Phase-6 marketing pages may
-- deep-link by it. `cadence` is a billing-cadence DISPLAY label, orthogonal to the vigencia access
-- window (`actualizar_paquete`'s pinned vigencia_dias=30 is untouched).
alter table public.paquetes add column if not exists code     text;
alter table public.paquetes add column if not exists name     text;
alter table public.paquetes add column if not exists subtitle text;
alter table public.paquetes add column if not exists badge    text;
alter table public.paquetes add column if not exists cadence  text;

-- unique(gym_id, code): a code is unique WITHIN a gym. NULLs are distinct (standard Postgres), so the
-- many existing rows without a code do not collide — code stays optional marketing metadata.
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'paquetes_code_gym_uq' and conrelid = 'public.paquetes'::regclass) then
    alter table public.paquetes add constraint paquetes_code_gym_uq unique (gym_id, code);
  end if;
end $$;

-- ── 2. plan_feature: ordered per-plan marketing feature list (child of paquetes) ──────────────────
-- Curated/showcased class (ADR-0013 §3): staff write, gym-member read (policies in the sibling file).
-- gym_id is carried on the row (not only inferred through plan_id) so every RLS predicate is a direct
-- indexed is_member_of/is_staff_of(gym_id) — the standard one-predicate-per-class shape. `on delete
-- cascade` ties a feature's life to its plan. `orden` is the display position (0-based).
create table if not exists public.plan_feature (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references public.gym (id),
  plan_id    uuid not null references public.paquetes (id) on delete cascade,
  label      text not null,
  orden      integer not null,
  created_at timestamptz not null default now(),
  constraint plan_feature_label_ck check (char_length(btrim(label)) between 1 and 80)
);

-- Index both FKs (schema-foreign-key-indexes): plan_id backs the per-plan list read + the cascade;
-- gym_id backs the RLS predicate (security-rls-performance).
create index if not exists plan_feature_plan_id_idx on public.plan_feature (plan_id);
create index if not exists plan_feature_gym_id_idx  on public.plan_feature (gym_id);

-- Belt-and-suspenders (also done by the rls_auto_enable event trigger; ADR-0001).
alter table public.plan_feature enable row level security;

-- ── 3. Authoring RPCs (ADR-0005: SECURITY INVOKER, search_path '', least-privilege EXECUTE) ───────
-- (a) Marketing-scalar edit. DELIBERATELY separate from `actualizar_paquete` (the money/grant editor):
-- the two are orthogonal per (a), and keeping them apart leaves the tested money-path RPC untouched.
-- Empty strings normalize to NULL (an operator clearing a field). RLS scopes the UPDATE to the caller's
-- gym; a code collision surfaces as paquetes_code_gym_uq (23505), mapped to a friendly message in the DAL.
create or replace function public.actualizar_paquete_marketing(
  p_id uuid, p_code text, p_name text, p_subtitle text, p_badge text, p_cadence text)
  returns void language plpgsql security invoker set search_path to '' as $function$
declare v_uid uuid;
begin
  v_uid := (select auth.uid()); if v_uid is null then raise exception 'No autenticado'; end if;
  update public.paquetes
     set code     = nullif(btrim(p_code), ''),
         name     = nullif(btrim(p_name), ''),
         subtitle = nullif(btrim(p_subtitle), ''),
         badge    = nullif(btrim(p_badge), ''),
         cadence  = nullif(btrim(p_cadence), '')
   where id = p_id;                 -- RLS scopes the row to the caller's gym (staff write)
  if not found then raise exception 'Paquete no encontrado'; end if;
end; $function$;

revoke execute on function public.actualizar_paquete_marketing(uuid, text, text, text, text, text) from public, anon;
grant  execute on function public.actualizar_paquete_marketing(uuid, text, text, text, text, text) to authenticated;

-- (b) Replace a plan's whole ordered feature list in one transaction — covers add/remove/reorder from a
-- single desired-state array (the editor sends the full list; `orden` = array position). The plan's gym
-- is derived server-side from the (RLS-scoped) paquetes row — never client-supplied (ADR-0008); a
-- cross-tenant plan_id resolves to no row → 'Paquete no encontrado'. The delete + insert run under the
-- caller's RLS (staff delete/insert on plan_feature), so isolation holds without SECURITY DEFINER.
create or replace function public.set_plan_features(p_plan_id uuid, p_labels text[])
  returns void language plpgsql security invoker set search_path to '' as $function$
declare v_uid uuid; v_gym uuid;
begin
  v_uid := (select auth.uid()); if v_uid is null then raise exception 'No autenticado'; end if;
  select gym_id into v_gym from public.paquetes where id = p_plan_id;  -- RLS-scoped read
  if v_gym is null then raise exception 'Paquete no encontrado'; end if;
  delete from public.plan_feature where plan_id = p_plan_id;           -- staff delete (RLS)
  insert into public.plan_feature (gym_id, plan_id, label, orden)
    select v_gym, p_plan_id, btrim(t.label), (t.ord - 1)::int
      from unnest(p_labels) with ordinality as t(label, ord)
     where btrim(t.label) <> '';                                       -- skip blanks defensively
end; $function$;

revoke execute on function public.set_plan_features(uuid, text[]) from public, anon;
grant  execute on function public.set_plan_features(uuid, text[]) to authenticated;

-- ── 4. Tripwire: the duplicate columns (a) forbids must NEVER exist ───────────────────────────────
-- Reuse is binding — a future migration that adds class_quota/is_unlimited/is_featured/price_cents fails
-- here on the next apply. This is the machine check the acceptance criterion requires.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'paquetes'
      and column_name in ('class_quota', 'is_unlimited', 'is_featured', 'price_cents')
  ) then
    raise exception 'FORBIDDEN duplicate column on paquetes — reuse clases/popular/precio (PRD #36 decision (a)); do NOT add class_quota/is_unlimited/is_featured/price_cents';
  end if;
end $$;
