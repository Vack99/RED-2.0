-- S5 — per-gym folio counter + registrar_venta rewiring + the four user_id→gym-scoped unique re-keys
-- (slice #24; PRD #17 S5; ADR-0005 atomic-write seam, ADR-0008 gym isolation, ADR-0013 counter posture).
--
-- WHAT — the per-gym numbering + ownership re-keys of the shield's migration contract:
--   • Folio: replace the global `venta_folio_seq` draw + `ventas_folio_uq unique(folio)` with a per-gym
--     COUNTER ROW (one per gym) bumped INSIDE registrar_venta's transaction, backing `unique(gym_id, folio)`.
--     Each gym seeds from its OWN max(folio); existing folios keep their values; gym #2 sequences
--     independently from gym #1. NOT per-gym sequences (a counter row, as the contract specifies).
--   • Re-key four user_id-keyed uniques gym-scoped: perfil/cobro unique(user_id)→unique(gym_id);
--     paquetes unique(user_id,nombre)→(gym_id,nombre); paquetes_one_popular partial index per-operator→per-gym.
--     The redundant `user_id` columns STAY (their drop is a later HITL contract step).
--
-- CONSTRAINT-SWAP SANCTION (issue #24): dropping the old constraints while adding the gym-scoped ones is
-- the issue's stated contract ("replace"/"re-key"), a swap ALL live data satisfies — NOT data loss. Verified
-- before writing: 1 perfil + 1 cobro per data-bearing gym, no duplicate paquete names or >1 popular within a
-- gym, folios already globally unique (so unique(gym_id,folio) strictly widens satisfiability).
--
-- BLOCK→UNBLOCK: a prior run of this slice was [BLOCKED] because the dev's test account and the real client
-- shared the one `forge` gym, giving duplicate perfil/cobro/paquetes rows that the unique(gym_id) re-keys
-- could not satisfy. Resolved 2026-07-02 by a human HITL action — the dev's entire universe was MOVED into a
-- new `forge-demo` gym (no rows deleted) — after which every re-key became satisfiable as literally specified.
--
-- gym derivation in registrar_venta is UNCHANGED from #20 (forge for a new cliente / the cliente's gym for an
-- existing one) — membership-based derivation is the RLS cutover's job, not this slice's. Idempotent
-- (if-not-exists / drop-if-exists / on-conflict-do-nothing / guarded add-constraint), additive+swap only, so
-- it is safe on a fresh preview branch AND out-of-order on the live project. One transaction; Forge stays green.

-- ── 1. Per-gym folio counter (internal mechanism table; ADR-0013 posture) ─────
-- One row per gym holding the last-issued folio. RLS ON with ZERO client policies: this is not tenant data
-- a client ever reads — it is a sequence-like mechanism reachable only through next_folio() below. The PK on
-- gym_id doubles as the FK index.
create table if not exists public.gym_folio_counter (
  gym_id     uuid primary key references public.gym (id) on delete cascade,
  last_folio bigint not null
);
alter table public.gym_folio_counter enable row level security;

-- Seed each EXISTING gym from its OWN max(folio); a gym with no ventas seeds to 1000 so its first folio is
-- 1001 (the historical `venta_folio_seq start 1001`). Idempotent.
insert into public.gym_folio_counter (gym_id, last_folio)
  select g.id, coalesce((select max(v.folio) from public.ventas v where v.gym_id = g.id), 1000)
  from public.gym g
  on conflict (gym_id) do nothing;

-- ── 2. Atomic per-gym folio draw (SECURITY DEFINER; ADR-0013 §1 pattern) ──────
-- registrar_venta is SECURITY INVOKER (ADR-0005) → it runs as `authenticated` and so cannot write the
-- policy-less counter table. This narrow definer helper performs the single privileged step: lazily seed the
-- gym's counter row (from its own max(folio); a no-op once seeded) then a SINGLE-STATEMENT row-locked
-- increment — so concurrent sales in one gym serialize on that counter row (deadlock-safe: one statement,
-- one lock). Chosen over an RLS policy because a policy would (a) need the is_staff_of helper that ships with
-- the RLS cutover, not this slice, and (b) have to let `authenticated` UPDATE arbitrary gyms' counters —
-- strictly wider than this one-purpose function. Least privilege: EXECUTE revoked from public/anon.
create or replace function public.next_folio(p_gym uuid)
  returns bigint
  language plpgsql
  security definer
  set search_path to ''
as $function$
declare v_folio bigint;
begin
  insert into public.gym_folio_counter (gym_id, last_folio)
    values (p_gym, coalesce((select max(folio) from public.ventas where gym_id = p_gym), 1000))
    on conflict (gym_id) do nothing;
  update public.gym_folio_counter
     set last_folio = last_folio + 1
   where gym_id = p_gym
   returning last_folio into v_folio;
  return v_folio;
end;
$function$;
revoke execute on function public.next_folio(uuid) from public, anon;
grant  execute on function public.next_folio(uuid) to authenticated;

-- ── 3. registrar_venta draws folio from the per-gym counter (body change only) ─
-- Same signature → CREATE OR REPLACE preserves the existing EXECUTE grants (authenticated only; anon revoked).
-- Only the folio source changes: from the dropped global sequence default to next_folio(v_gym), inserted
-- explicitly. gym derivation is byte-for-byte the #20 version.
create or replace function public.registrar_venta(
  p_nombre text,
  p_tel text,
  p_paquete_nombre text,
  p_vigencia_tipo text,
  p_monto integer,
  p_metodo text,
  p_cliente_id uuid default null,
  p_clases_restantes integer default null,
  p_vence date default null,
  p_clases integer default null,
  p_vigencia_dias integer default null
)
 returns table(folio bigint, cliente_id uuid)
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_cliente uuid;
  v_gym uuid;
  v_folio bigint;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if p_cliente_id is null then
    v_gym := (select id from public.gym where slug = 'forge');
    insert into public.clientes (user_id, nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
    values (v_uid, p_nombre, p_tel, p_clases_restantes, p_vence, p_paquete_nombre, v_gym)
    returning id into v_cliente;
  else
    update public.clientes
       set clases_restantes = p_clases_restantes,
           vence = p_vence,
           paquete_nombre = p_paquete_nombre
     where id = p_cliente_id;          -- RLS scopes this to the owner
    if not found then
      raise exception 'Cliente no encontrado';
    end if;
    v_cliente := p_cliente_id;
    select gym_id into v_gym from public.clientes where id = p_cliente_id;  -- venta inherits the cliente's gym
  end if;

  -- Per-gym folio, drawn + incremented atomically inside this transaction (row-locked; see next_folio).
  v_folio := public.next_folio(v_gym);
  insert into public.ventas (user_id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, gym_id)
  values (v_uid, v_cliente, v_folio, p_paquete_nombre, p_clases, p_vigencia_tipo, p_vigencia_dias, p_monto, p_metodo, v_gym);

  return query select v_folio, v_cliente;
end;
$function$;

-- ── 4. Retire the global folio sequence (now counter-driven) ──────────────────
-- Drop the column default FIRST (it references the sequence), then the sequence itself.
alter table public.ventas alter column folio drop default;
drop sequence if exists public.venta_folio_seq;

-- ── 5. Re-key: four user_id uniques → gym-scoped; global folio unique → per-gym ─
-- Drops are IF EXISTS and adds are guarded, so re-application is harmless.
alter table public.ventas   drop constraint if exists ventas_folio_uq;
alter table public.perfil   drop constraint if exists perfil_user_id_key;
alter table public.cobro    drop constraint if exists cobro_user_id_key;
alter table public.paquetes drop constraint if exists paquetes_nombre_uq;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='ventas_folio_gym_uq'  and conrelid='public.ventas'::regclass)   then
    alter table public.ventas   add constraint ventas_folio_gym_uq  unique (gym_id, folio);
  end if;
  if not exists (select 1 from pg_constraint where conname='perfil_gym_id_key'    and conrelid='public.perfil'::regclass)   then
    alter table public.perfil   add constraint perfil_gym_id_key    unique (gym_id);
  end if;
  if not exists (select 1 from pg_constraint where conname='cobro_gym_id_key'     and conrelid='public.cobro'::regclass)    then
    alter table public.cobro    add constraint cobro_gym_id_key     unique (gym_id);
  end if;
  if not exists (select 1 from pg_constraint where conname='paquetes_nombre_gym_uq' and conrelid='public.paquetes'::regclass) then
    alter table public.paquetes add constraint paquetes_nombre_gym_uq unique (gym_id, nombre);
  end if;
end $$;

-- one-popular-per-gym (was per-operator): re-key the partial unique index
drop index if exists public.paquetes_one_popular;
create unique index if not exists paquetes_one_popular on public.paquetes (gym_id) where popular;
