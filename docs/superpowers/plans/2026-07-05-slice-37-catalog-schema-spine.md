# Slice #37 — S0 Catalog Schema Spine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (No subagent dispatch — the shipping agent for this slice executes inline, sequentially, per its own constraints.)

**Goal:** Ship the curated-catalog schema spine (`coach`, `class_type` + 2 ordered-list children, `room`) that every later Phase-5 slice FKs onto: gym-scoped, RLS-by-membership (curated/showcased class — ADR-0013), branded ids, denial-test-first, database types regenerated.

**Architecture:** One expand-only SQL migration creates 5 tables (all `gym_id uuid not null references gym(id)`, all RLS-enabled) mirroring the exact RLS shape already live on `paquetes`/`perfil`/`plantillas` (20260702173309): `select` via `is_member_of(gym_id)` to `authenticated`, `insert`/`update` via `is_staff_of(gym_id)` to `authenticated`, no `delete` policy, no `anon` grant anywhere. One new denial-test SQL file (self-asserting, `BEGIN/ROLLBACK`, zero hardcoded prod UUIDs) proves cross-tenant staff-write denial + member-read denial + anon-read denial for all 5 tables, registered in `run-denial-suite.mjs`'s `SUITE` array. Three new branded ids (`CoachId`, `ClassTypeId`, `RoomId`) added to `packages/domain/src/ids.ts` following the existing `ClienteId`/`PaqueteId` pattern.

**Tech Stack:** Postgres/Supabase migrations (`supabase/migrations/*.sql`), the repo's hand-rolled denial-suite harness (`supabase/tests/*.mjs`), TypeScript branded-id pattern (`packages/domain/src/ids.ts`), Supabase MCP (`apply_migration`, `get_advisors`, `generate_typescript_types`) for the live apply.

## Global Constraints

- Expand-only: no `ALTER`/`DROP` of any existing table; every new object is `create table if not exists` / `create policy` after `drop policy if exists` (idempotent).
- Every new table: `gym_id uuid not null references public.gym (id) on delete cascade`, indexed, `alter table ... enable row level security` (explicit, even though `rls_auto_enable` also fires).
- RLS shape (curated/showcased, ADR-0013 §3, PRD #36 decision b): `select` → `is_member_of(gym_id)` to `authenticated`; `insert`+`update` → `is_staff_of(gym_id)` to `authenticated`; **no delete policy** (mirrors `paquetes`/`perfil`); **no anon grant anywhere** (decision b: anon read is Phase 6).
- Every helper call in a policy wrapped in `(select ...)` (initplan-cache idiom, ADR-0001/ADR-0013 §2).
- Manual pre-DDL dump into `C:\Users\Aaron\Documents\RED-2.0-backups\` is MANDATORY before the live `apply_migration` call; abort `[BLOCKED]` if it cannot be taken.
- Denial suite must be recorded RED (tables don't exist / policies absent) before the migration, GREEN after — per TDD non-negotiable.
- `get_advisors` (security) must be clean of new findings after the policy migration.
- Regenerate `packages/data/src/database.types.ts` after the migration lands.
- Any ARCHITECTURE.md/CONTEXT.md row citing a new path lands in the same commit that creates the path.
- `keep-it-lean`: no columns/tables/policies beyond what data-model §4 + the PRD (a)-(m) decisions name. No delete policy, no anon policy, no authoring RPCs (those are S8).

---

## Task 1: Branded ids for `coach`, `class_type`, `room`

**Files:**
- Modify: `packages/domain/src/ids.ts`

**Interfaces:**
- Produces: `CoachId`, `ClassTypeId`, `RoomId` (types) and `asCoachId`, `asClassTypeId`, `asRoomId` (mint functions) — exported from `@gym/domain/ids`, importable by any later Phase-5 slice (S1 `class_session_coach`, S8 authoring DAL).

- [ ] **Step 1: Add the three brands + mint functions**

Append to `packages/domain/src/ids.ts` (after the existing `PaqueteId` block):

```ts
export type CoachId = Brand<string, "CoachId">;
export type ClassTypeId = Brand<string, "ClassTypeId">;
export type RoomId = Brand<string, "RoomId">;

export const asCoachId = (id: string): CoachId => id as CoachId;
export const asClassTypeId = (id: string): ClassTypeId => id as ClassTypeId;
export const asRoomId = (id: string): RoomId => id as RoomId;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: exit 0 (no existing consumer references these types yet, so nothing else changes).

- [ ] **Step 3: Commit**

```bash
git add packages/domain/src/ids.ts
git commit -m "feat(domain): add CoachId/ClassTypeId/RoomId branded ids (slice #37)"
```

---

## Task 2: Denial test — write FIRST, prove RED

**Files:**
- Create: `supabase/tests/catalog_rls_denial.sql`
- Modify: `supabase/tests/run-denial-suite.mjs` (register the new file in `SUITE`)

**Interfaces:**
- Consumes: the seeded-fixture idiom from `supabase/tests/rls_cross_tenant_denial.sql` (gym A = `forge` looked up by slug; a synthetic gym B `gen_random_uuid()`; synthetic `auth.users` rows; `gym_membership` rows) and the three helpers `is_member_of`/`is_staff_of`/`has_role` (already live, from slice #19).
- Produces: one self-asserting file that RAISEs on any leak, returns `'catalog rls denial: OK'` on success, wrapped in `begin;`/`rollback;` (touches no permanent row).

- [ ] **Step 1: Write the test file**

```sql
-- Cross-tenant + anon RLS denial suite for the S0 catalog spine (coach, class_type
-- +children, room) — slice #37 (PRD #36 S0; ADR-0013 curated/showcased class; decision b:
-- no anon read yet).
--
-- Denial-test-FIRST (TDD): recorded RED before the 20260706... migration creates these
-- tables/policies (fails with "relation does not exist"), GREEN after. Mirrors the
-- rls_cross_tenant_denial.sql fixture idiom — zero hardcoded prod UUIDs, transaction-local,
-- self-asserting (every check RAISEs on failure; a clean run returns one 'OK' row).
--
-- Vectors proved:
--   1) staff of gym A (is_staff_of) may insert+update all 5 tables in gym A.
--   2) a cross-tenant operator (staff of gym B only) reads 0 rows of gym A's catalog and
--      every write attempt against gym A's rows affects 0 rows.
--   3) a gym-A MEMBER (is_member_of, no staff role) reads gym A's catalog but every write
--      attempt affects 0 rows (curated class: members never write).
--   4) anon reads 0 rows on all 5 tables (decision b: anon is deferred to Phase 6).
--
-- HOW TO RUN: node supabase/tests/run-denial-suite.mjs (SUPABASE_TARGET_REF override), or
-- ad hoc via the Supabase MCP execute_sql.

begin;

do $$
declare
  gym_a       uuid;
  gym_b       uuid := gen_random_uuid();
  operator_a  uuid := gen_random_uuid();
  operator_b  uuid := gen_random_uuid();
  member_a    uuid := gen_random_uuid();
  ct_a        uuid;
begin
  select id into gym_a from public.gym where slug = 'forge';
  if gym_a is null then
    raise exception 'SEED FAIL: expected the forge gym from the spine seeds';
  end if;

  insert into public.gym (id, slug, brand_name, timezone, brand_module_id)
    values (gym_b, 'catalog-denial-gym-2', 'Catalog Denial Gym 2', 'America/Mexico_City', 'red');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', operator_a, 'authenticated', 'authenticated', 'catalog-operator-a@test.local'),
    ('00000000-0000-0000-0000-000000000000', operator_b, 'authenticated', 'authenticated', 'catalog-operator-b@test.local'),
    ('00000000-0000-0000-0000-000000000000', member_a,   'authenticated', 'authenticated', 'catalog-member-a@test.local');

  insert into public.gym_membership (user_id, gym_id, role) values
    (operator_a, gym_a, 'operator'),
    (operator_b, gym_b, 'operator'),
    (member_a,   gym_a, 'member');

  -- One row per gym-A catalog table (owned by staff via the migration role, RLS bypassed —
  -- exactly how the app's future authoring RPCs will seed rows).
  insert into public.coach (gym_id, name, initials, role) values (gym_a, 'Coach Denial', 'CD', 'coach');
  insert into public.room  (gym_id, name) values (gym_a, 'Sala Principal');
  insert into public.class_type (gym_id, name) values (gym_a, 'Funcional')
    returning id into ct_a;
  insert into public.class_type_workblock (gym_id, class_type_id, label) values (gym_a, ct_a, 'Calentamiento');
  insert into public.class_type_bring_item (gym_id, class_type_id, label) values (gym_a, ct_a, 'Toalla');

  perform set_config('t.gym_a',      gym_a::text,      true);
  perform set_config('t.gym_b',      gym_b::text,      true);
  perform set_config('t.operator_a', operator_a::text, true);
  perform set_config('t.operator_b', operator_b::text, true);
  perform set_config('t.member_a',   member_a::text,   true);
  perform set_config('t.class_type_a', ct_a::text,      true);
end $$;

-- ── anon: reads 0 on all 5 tables ─────────────────────────────────────────────
set local role anon;
do $$
declare n int;
begin
  select count(*) into n from public.coach;                   if n <> 0 then raise exception 'ANON FAIL: coach % rows visible', n; end if;
  select count(*) into n from public.class_type;              if n <> 0 then raise exception 'ANON FAIL: class_type % rows visible', n; end if;
  select count(*) into n from public.class_type_workblock;    if n <> 0 then raise exception 'ANON FAIL: class_type_workblock % rows visible', n; end if;
  select count(*) into n from public.class_type_bring_item;   if n <> 0 then raise exception 'ANON FAIL: class_type_bring_item % rows visible', n; end if;
  select count(*) into n from public.room;                    if n <> 0 then raise exception 'ANON FAIL: room % rows visible', n; end if;
end $$;
reset role;

-- ── staff of gym A: reads + writes all 5 tables (positive control) ───────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.operator_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  n int;
  ct uuid := current_setting('t.class_type_a', true)::uuid;
begin
  select count(*) into n from public.coach;                  if n <> 1 then raise exception 'STAFF FAIL: operator_a sees % coach rows (expected 1)', n; end if;
  select count(*) into n from public.class_type;             if n <> 1 then raise exception 'STAFF FAIL: operator_a sees % class_type rows', n; end if;
  select count(*) into n from public.class_type_workblock;   if n <> 1 then raise exception 'STAFF FAIL: operator_a sees % workblock rows', n; end if;
  select count(*) into n from public.class_type_bring_item;  if n <> 1 then raise exception 'STAFF FAIL: operator_a sees % bring_item rows', n; end if;
  select count(*) into n from public.room;                   if n <> 1 then raise exception 'STAFF FAIL: operator_a sees % room rows', n; end if;

  update public.coach set bio = 'updated' where gym_id = (select id from public.gym where slug = 'forge');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'STAFF FAIL: operator_a coach update hit % rows (expected 1)', n; end if;

  update public.class_type set description = 'updated' where id = ct;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'STAFF FAIL: operator_a class_type update hit % rows (expected 1)', n; end if;
end $$;
reset role;

-- ── cross-tenant: operator_b (staff of gym B only) reads 0 / writes 0 on gym A's rows ──
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.operator_b', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  n int;
  ct uuid := current_setting('t.class_type_a', true)::uuid;
  gym_a uuid := current_setting('t.gym_a', true)::uuid;
begin
  select count(*) into n from public.coach where gym_id = gym_a;                 if n <> 0 then raise exception 'DENIAL FAIL: operator_b sees % of gym A''s coach rows', n; end if;
  select count(*) into n from public.class_type where gym_id = gym_a;           if n <> 0 then raise exception 'DENIAL FAIL: operator_b sees % of gym A''s class_type rows', n; end if;
  select count(*) into n from public.class_type_workblock where gym_id = gym_a; if n <> 0 then raise exception 'DENIAL FAIL: operator_b sees % of gym A''s workblock rows', n; end if;
  select count(*) into n from public.class_type_bring_item where gym_id = gym_a;if n <> 0 then raise exception 'DENIAL FAIL: operator_b sees % of gym A''s bring_item rows', n; end if;
  select count(*) into n from public.room where gym_id = gym_a;                 if n <> 0 then raise exception 'DENIAL FAIL: operator_b sees % of gym A''s room rows', n; end if;

  update public.coach set bio = 'hacked' where gym_id = gym_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'DENIAL FAIL: operator_b updated % of gym A''s coach rows', n; end if;

  update public.class_type set description = 'hacked' where id = ct;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'DENIAL FAIL: operator_b updated % of gym A''s class_type rows', n; end if;

  insert into public.coach (gym_id, name, initials, role) values (gym_a, 'Injected', 'IJ', 'coach');
  raise exception 'DENIAL FAIL: operator_b inserted a coach row into gym A (with-check did not deny)';
exception
  when others then
    if sqlerrm like 'DENIAL FAIL%' then raise; end if;
    -- expected: the with-check policy rejects the insert (new row violates row-level security policy)
end $$;
reset role;

-- ── member of gym A: reads the catalog, but every write affects 0 rows ────────
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.member_a', true), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  n int;
  ct uuid := current_setting('t.class_type_a', true)::uuid;
begin
  select count(*) into n from public.coach;      if n <> 1 then raise exception 'MEMBER FAIL: member_a sees % coach rows (expected 1)', n; end if;
  select count(*) into n from public.class_type; if n <> 1 then raise exception 'MEMBER FAIL: member_a sees % class_type rows (expected 1)', n; end if;
  select count(*) into n from public.room;       if n <> 1 then raise exception 'MEMBER FAIL: member_a sees % room rows (expected 1)', n; end if;

  update public.coach set bio = 'member-write' where id = (select id from public.coach limit 1);
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'MEMBER FAIL: member_a wrote % coach rows (curated class is staff-write-only)', n; end if;

  update public.class_type set description = 'member-write' where id = ct;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'MEMBER FAIL: member_a wrote % class_type rows', n; end if;
end $$;
reset role;

select 'catalog rls denial: OK' as result;
rollback;
```

- [ ] **Step 2: Register the file in the harness**

In `supabase/tests/run-denial-suite.mjs`, extend the `SUITE` array (append after `'contract_b_denials.sql'`):

```js
const SUITE = [
  'rls_cross_tenant_denial.sql',
  'gym_tenant_anon_read.sql',
  'gym_membership_rls.sql',
  'folio_per_gym.sql',
  'rekey_gym_scoped.sql',
  'registro_claim.sql',
  'contract_a_denials.sql',
  'contract_b_denials.sql',
  'catalog_rls_denial.sql',
];
```

- [ ] **Step 3: Record RED**

Run against a reachable target (scratch project ref via `SUPABASE_TARGET_REF`, or the Supabase MCP `execute_sql` tool with the raw file contents) BEFORE Task 3's migration exists. Expected: fails with `relation "public.coach" does not exist` (or similar) — the tables don't exist yet. Record the exact error text as the RED evidence.

- [ ] **Step 4: Commit (test file only — RED, expected to fail until Task 3 lands)**

```bash
git add supabase/tests/catalog_rls_denial.sql supabase/tests/run-denial-suite.mjs
git commit -m "test(rls): catalog spine denial suite — RED before schema (slice #37)"
```

---

## Task 3: The migration — 5 tables + RLS (expand-only)

**Files:**
- Create: `supabase/migrations/20260705230121_create_catalog_spine.sql`

**Interfaces:**
- Consumes: `public.gym(id)`, `public.is_member_of(uuid)`, `public.is_staff_of(uuid)` (all live since slices #18/#19).
- Produces: `public.coach`, `public.class_type`, `public.class_type_workblock`, `public.class_type_bring_item`, `public.room` — the tables S1 (`class_session`/`schedule_template`), S2 (`plan` evolution), and S8 (authoring) FK onto or read.

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Record GREEN**

Re-run `catalog_rls_denial.sql` (Task 2) against the same target the migration was applied to. Expected: single row `catalog rls denial: OK`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260705230121_create_catalog_spine.sql
git commit -m "feat(db): catalog schema spine — coach/class_type(+children)/room, RLS (closes denial RED, slice #37)"
```

---

## Task 4: Live apply (pre-DDL dump gate) + advisors + types regen

**Files:**
- Create: `C:\Users\Aaron\Documents\RED-2.0-backups\2026-07-06-slice-37\` (manual dump, outside the repo)
- Modify: `packages/data/src/database.types.ts` (regenerated)

- [ ] **Step 1: Manual pre-DDL dump**

Dump every `public` table (row counts + data) into `C:\Users\Aaron\Documents\RED-2.0-backups\2026-07-06-slice-37\`, following the `docs/runbooks/hitl-28-evidence.md` mechanism/evidence format. If this cannot be taken, STOP and report `[BLOCKED]` — do not proceed to Step 2.

- [ ] **Step 2: Apply the migration to the live project**

Via the Supabase MCP `apply_migration` tool, name `create_catalog_spine`, query = the exact contents of `supabase/migrations/20260705230121_create_catalog_spine.sql` from Task 3.

- [ ] **Step 3: `get_advisors` (security)**

Run the Supabase MCP `get_advisors` tool with `type: "security"`. Expected: no NEW findings beyond the pre-existing baseline (documented `docs/health/2026-07-05-post-cutover-db-audit.md` findings are pre-existing, not this slice's).

- [ ] **Step 4: Regenerate database types**

Run the Supabase MCP `generate_typescript_types` tool; overwrite `packages/data/src/database.types.ts` with the result (`Tables.coach`, `Tables.class_type`, `Tables.class_type_workblock`, `Tables.class_type_bring_item`, `Tables.room` must appear).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/database.types.ts
git commit -m "chore(data): regenerate database.types.ts for the catalog spine (slice #37)"
```

---

## Task 5: Docs — ARCHITECTURE.md / CONTEXT.md rows for the new tables

**Files:**
- Modify: `docs/planning/2026-06-29-target-data-model-and-decisions.md` only if the shipped shape diverges from what's documented (expect no diff — the migration matches §4 verbatim).
- No ARCHITECTURE.md/CONTEXT.md change is required: these are DB tables, not new packages/files/sectors — the existing "Where do I add X" + glossary rows already cover `packages/domain/src/ids.ts` and `supabase/migrations/`. Skip unless a new *path* (not a DB object) was created that isn't already covered.

- [ ] **Step 1: Confirm no new path needs a doc row**

Check: did this slice add a new top-level file/folder pattern not already described in ARCHITECTURE.md (e.g. a new package, a new sector)? No — `packages/domain/src/ids.ts` and `supabase/migrations/` / `supabase/tests/` are pre-existing, already-documented paths. No doc edit needed. (If this check finds otherwise, add the row here before Task 6.)

---

## Task 6: Final verification + handoff

- [ ] **Step 1: Full shield run**

```bash
pnpm lint && pnpm typecheck && pnpm test
```
Expected: exit 0 on all three.

- [ ] **Step 2: `keep-it-lean` self-check**

Invoke the `keep-it-lean` skill against the full diff before calling it done.

- [ ] **Step 3: Re-run the denial suite once more (regression, all files)**

Confirm all files in `SUITE` (not just `catalog_rls_denial.sql`) are green — the new tables/policies must not regress any earlier slice's assertions (they shouldn't; purely additive).

- [ ] **Step 4: Acceptance-criteria checklist**

- [ ] Cross-tenant denial tests written + recorded RED before / GREEN after.
- [ ] All five tables live with RLS, expand-only, pre-DDL dump evidence recorded.
- [ ] Branded ids exported; `database.types.ts` regenerated.
- [ ] `get_advisors` clean of new findings.
- [ ] Shields green; no doc-row gap.
