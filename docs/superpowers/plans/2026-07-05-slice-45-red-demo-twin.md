# red-demo gym twin — seed + evidence (slice #45) — Implementation Plan

> **For agentic workers:** this plan is executed INLINE, single-agent (no sub-agent dispatch
> available on this slice) — steps run in order, feedback loops (`pnpm lint`/`typecheck`/`test`)
> checked at the end, not per-step (this slice is DB seed + one evidence doc, not app code).

**Goal:** Stand up the `red-demo` gym twin (mirrors the live `forge-demo` precedent) on the live
Supabase project — a per-brand demo sandbox with its own owner membership, host mapping, starter
catalog (coaches/class types), plan marketing fields + features, and a seeded week of sessions
(one recurring template + one evento especial) — so Phase-5 verification and future RED work never
touch live forge rows. Close with an evidence doc recording the dump, the seed, and a denial check.

**Architecture:** No schema changes (expand-only DDL already shipped by #37/#42/#38, all present on
live). This slice is pure DML against live: (1) raw inserts for the three rows with no write seam
(`gym`, `gym_membership`, `auth.users`) per the issue's explicit carve-out, (2) the shipped RPC/DAL
write paths for everything else, called AS the demo operator via the header-sanctioned
`set_config('request.jwt.claims', ...); set local role authenticated;` impersonation trick (the
same mechanism `supabase/tests/rls_cross_tenant_denial.sql` uses, but committed for real instead of
rolled back), executed via the Supabase MCP `execute_sql` tool.

**Tech Stack:** Postgres/Supabase (live project `hjppxawglmukfvsgmcog`), pgcrypto (bcrypt password
hash), no application code changes.

## Global Constraints

- Manual pre-write dump into `C:\Users\Aaron\Documents\RED-2.0-backups\` is MANDATORY before any
  live mutating write; abort `[BLOCKED]` if it cannot be taken.
- NEVER destructive SQL against the live project. Raw inserts ONLY for `gym`, `gym_membership`,
  `auth.users` (no seam exists); everything else through the shipped RPCs/DAL.
- Gym-content tables (`about_value`/`facility`/`stat`/`faq`) belong to #39 — if absent on live at
  seed time, skip and note the deferral; do NOT create them.
- Never touch `packages/brand/**`. Never modify schema/migrations (this slice ships zero new
  migrations).
- `keep-it-lean`: no new abstractions — this is data, not code.

---

## Task 1: Pre-write live dump

**Files:**
- Create: `C:\Users\Aaron\Documents\RED-2.0-backups\2026-07-05-slice-45-red-demo-twin\*.json`
  (one file per public table currently populated/relevant + `auth_users.json` + `_manifest.json`)

- [ ] **Step 1**: Via Supabase MCP `execute_sql`, for each table in `{gym, gym_domain,
  gym_membership, gym_folio_counter, coach, class_type, class_type_workblock,
  class_type_bring_item, room, schedule_template, class_session, class_session_coach,
  schedule_template_coach, plan_feature, paquetes, clientes, ventas, asistencias, perfil,
  plantillas, cobro}` run `select coalesce(json_agg(t), '[]') from public.<table> t;` and write the
  result verbatim to `<table>.json` in the dump dir.
- [ ] **Step 2**: Run `select coalesce(json_agg(json_build_object('id',id,'email',email,
  'created_at',created_at)), '[]') from auth.users;` (NO token/secret columns) → `auth_users.json`.
- [ ] **Step 3**: Write `_manifest.json`: `{ "taken_at": <iso>, "project":
  "hjppxawglmukfvsgmcog", "slice": 45, "purpose": "pre-seed snapshot before red-demo gym twin",
  "counts": { ...per-table row counts... } }`.
- [ ] **Step 4**: Confirm all files are non-empty/valid JSON before proceeding. If the dump cannot
  be taken, STOP and return `[BLOCKED]`.

## Task 2: Raw-insert the three no-seam rows (gym, auth user, membership) + host mapping

**Interfaces:** produces `red_demo_gym_id`, `red_demo_user_id` — every later task's RPC calls
impersonate `red_demo_user_id` and reference `red_demo_gym_id`.

- [ ] **Step 1**: Insert the auth user (bcrypt via pgcrypto, mirrors the standard "manual Supabase
  user" recipe; NOT the denial-suite's password-less synthetic fixtures — this account must be
  really loginable):
  ```sql
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'demo@red-demo.test', extensions.crypt('RedDemo!2026', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"email_verified":true}', now(), now(),
    '', '', '', ''
  )
  returning id;
  ```
  Record the returned uuid as `red_demo_user_id`.
- [ ] **Step 2**: Insert the gym row (mirrors forge-demo: same brand+tz as its live `red` twin):
  ```sql
  insert into public.gym (slug, brand_name, legal_name, timezone, brand_module_id, owner_user_id)
  values ('red-demo', 'RED Demo', 'RED Demo Gym', 'America/Chihuahua', 'red', '<red_demo_user_id>')
  returning id;
  ```
  Record as `red_demo_gym_id`.
- [ ] **Step 3**: Insert the membership (role `owner`, satisfies `is_staff_of`/`staff_gym()`):
  ```sql
  insert into public.gym_membership (user_id, gym_id, role)
  values ('<red_demo_user_id>', '<red_demo_gym_id>', 'owner');
  ```
- [ ] **Step 4**: Insert the host mapping (mirrors forge-demo's single admin-only `gym_domain` row —
  demo gyms are operator-testing sandboxes, no client-app host needed):
  ```sql
  insert into public.gym_domain (gym_id, hostname, app)
  values ('<red_demo_gym_id>', 'red-demo.localhost', 'admin');
  ```
- [ ] **Step 5**: Verify: `select slug, brand_module_id, timezone, owner_user_id from public.gym
  where slug='red-demo';` and confirm the membership + domain rows read back.

## Task 3: Seed catalog via the shipped write paths (as the demo operator)

Every write in this task runs inside one impersonation block:
```sql
select set_config('request.jwt.claims',
  json_build_object('sub', '<red_demo_user_id>', 'role', 'authenticated')::text, true);
set local role authenticated;
-- ... inserts / rpc calls ...
reset role;
```
This is the exact mechanism `rls_cross_tenant_denial.sql` uses to assert as a specific user — here
committed for real (no `begin`/`rollback` wrapper) since this is a genuine seed, not a test.

**Interfaces:** produces class_type ids (Fuerza/Funcional/Metcon/Open) and coach ids consumed by
Task 4's scheduling RPCs.

- [ ] **Step 1**: `class_type` — raw insert (no create-RPC exists for catalog rows; RLS insert
  policy `class_type_staff_insert` is the seam), four base types per the locked data model
  (`docs/planning/2026-06-29-target-data-model-and-decisions.md` §4: `Fuerza|Funcional|Metcon|Open`):
  ```sql
  insert into public.class_type (gym_id, name, sala, level, default_duration_min) values
    ('<red_demo_gym_id>', 'Fuerza',   'Sala Yunque', 'Todos los niveles', 60),
    ('<red_demo_gym_id>', 'Funcional','Sala Forja',  'Todos los niveles', 45),
    ('<red_demo_gym_id>', 'Metcon',   'Sala Brasa',  'Intermedio/avanzado', 45),
    ('<red_demo_gym_id>', 'Open',     'Sala Brasa',  'Todos los niveles', 60)
  returning id, name;
  ```
- [ ] **Step 2**: `coach` — a few rows (RLS insert policy `coach_staff_insert` is the seam):
  ```sql
  insert into public.coach (gym_id, name, initials, role, specialty, is_active, sort_order) values
    ('<red_demo_gym_id>', 'Marisa Peña',  'MP', 'Coach', 'Fuerza',    true, 0),
    ('<red_demo_gym_id>', 'Paty Ruiz',    'PR', 'Coach', 'Funcional', true, 1),
    ('<red_demo_gym_id>', 'Iván Duarte',  'ID', 'Coach', 'Metcon',    true, 2)
  returning id, name;
  ```
- [ ] **Step 3**: `paquetes` — raw insert (no create-RPC exists; mirrors forge's live 3-plan shape):
  ```sql
  insert into public.paquetes (gym_id, nombre, clases, vigencia_tipo, vigencia_dias, precio, popular, orden) values
    ('<red_demo_gym_id>', '8 clases',  8,    'dias', 30, 799,  false, 1),
    ('<red_demo_gym_id>', '12 clases', 12,   'dias', 30, 1199, true,  2),
    ('<red_demo_gym_id>', 'Ilimitado', null, 'dias', 30, 1350, false, 3)
  returning id, nombre;
  ```
- [ ] **Step 4**: Marketing fields + features on each plan, through the SHIPPED RPCs (#38 seam —
  `actualizar_paquete_marketing` / `set_plan_features`, both `SECURITY INVOKER` + `staff_gym()`
  scoped), called inside the impersonation block:
  ```sql
  select public.actualizar_paquete_marketing('<plan-8>'::uuid, 'ocho',    '8 clases',  'Para quien entrena por su cuenta', null,     'mensual');
  select public.actualizar_paquete_marketing('<plan-12>'::uuid,'doce',    '12 clases', 'El plan más popular',              'Popular','mensual');
  select public.actualizar_paquete_marketing('<plan-il>'::uuid,'abierta', 'Ilimitado', 'Acceso total, cuando quieras',      null,     'mensual');
  select public.set_plan_features('<plan-8>'::uuid,  array['Acceso a clases grupales','Sin permanencia']);
  select public.set_plan_features('<plan-12>'::uuid, array['Acceso a clases grupales','Reserva prioritaria','Sin permanencia']);
  select public.set_plan_features('<plan-il>'::uuid, array['Clases ilimitadas','Reserva prioritaria','Congelamiento hasta 15 días/mes']);
  ```
  (Function signature note: confirm exact `actualizar_paquete_marketing(p_id, p_code, p_name,
  p_subtitle, p_badge, p_cadence)` param order against the migration before running — the DAL
  wrapper in `packages/data/src/server/paquetes.ts` is the source of truth for argument names.)

## Task 4: Seed a realistic week — one recurring template + one evento especial

Same impersonation block as Task 3.

- [ ] **Step 1**: Recurring schedule via `create_recurring_schedule` (the #42 shipped RPC — one
  atomic insert of `schedule_template` rows + default coaches + materialization of the visible
  horizon):
  ```sql
  select public.create_recurring_schedule(
    p_class_type_id := '<metcon-id>'::uuid,
    p_weekdays := array[1,3]::int[],           -- Mar/Jue (weekday 0=Lun per schema)
    p_start_time := '07:00'::time,
    p_duration_min := 45,
    p_capacity := 20,
    p_coach_ids := array['<marisa-id>','<paty-id>']::uuid[],
    p_horizon_weeks := 2
  );
  ```
- [ ] **Step 2**: One evento especial via `create_class_session` (the #42 shipped RPC), dated later
  this week:
  ```sql
  select public.create_class_session(
    p_class_type_id := '<open-id>'::uuid,
    p_starts_at := (date_trunc('week', now() at time zone 'America/Chihuahua') + interval '5 days 18 hours') at time zone 'America/Chihuahua',
    p_duration_min := 60,
    p_capacity := 30,
    p_coach_ids := array['<ivan-id>']::uuid[],
    p_is_special := true,
    p_special_name := 'Reto RED'
  );
  ```
- [ ] **Step 3**: Verify: as the demo operator (same impersonation), `select count(*) from
  public.class_session where gym_id = '<red_demo_gym_id>';` — expect ≥ 2 materialized template
  instances + 1 evento especial.

## Task 5: Gym content (conditional — only if #39's tables are live)

- [ ] **Step 1**: `select exists (select 1 from information_schema.tables where table_schema='public'
  and table_name='about_value');` (repeat for `facility`, `stat`, `faq`).
- [ ] **Step 2a** (if ALL four exist): seed a couple of sample rows per table for `red_demo_gym_id`
  via raw insert (no seam expected yet — #39 is concurrent, its own RPCs if any land with that
  slice) inside the impersonation block, RLS-gated the same curated/showcased way.
- [ ] **Step 2b** (if NOT all four exist, the expected case per the issue's note): skip. Record in
  the evidence doc: "gym content seed deferred — #39 tables not yet live at seed time."

## Task 6: Cross-tenant isolation check (read-only, non-mutating)

- [ ] **Step 1**: Re-run the existing suite unchanged: `supabase/tests/rls_cross_tenant_denial.sql`
  via `execute_sql` (it is self-contained `begin;...rollback;`) — confirm the terminal `select
  'rls cross-tenant denial: OK'` still returns and no exception raised. This proves red-demo's mere
  existence introduces no regression to the existing gym-A/gym-B vectors.
- [ ] **Step 2**: Run one NEW ad hoc, non-mutating check (BEGIN/ROLLBACK, no permanent test file
  added — this slice seeds data, it doesn't extend the checked-in suite) proving the new gym is
  isolated both directions, using the REAL red-demo operator and REAL forge owner ids:
  ```sql
  begin;
  select set_config('request.jwt.claims',
    json_build_object('sub', '<red_demo_user_id>', 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from public.coach where gym_id = (select id from public.gym where slug='forge');
    if n <> 0 then raise exception 'FAIL: red-demo operator sees % of forge''s coach rows', n; end if;
    select count(*) into n from public.class_type where gym_id = (select id from public.gym where slug='forge');
    if n <> 0 then raise exception 'FAIL: red-demo operator sees % of forge''s class_type rows', n; end if;
    select count(*) into n from public.paquetes where gym_id = (select id from public.gym where slug='forge');
    if n <> 0 then raise exception 'FAIL: red-demo operator sees % of forge''s paquetes rows', n; end if;
    select count(*) into n from public.coach where gym_id = (select id from public.gym where slug='red-demo');
    if n <> 3 then raise exception 'FAIL: red-demo operator sees % of its own 3 coach rows', n; end if;
  end $$;
  reset role;
  select set_config('request.jwt.claims',
    json_build_object('sub', '<forge_owner_id>', 'role', 'authenticated')::text, true);
  set local role authenticated;
  do $$
  declare n int;
  begin
    select count(*) into n from public.coach where gym_id = (select id from public.gym where slug='red-demo');
    if n <> 0 then raise exception 'FAIL: forge owner sees % of red-demo''s coach rows', n; end if;
  end $$;
  reset role;
  rollback;
  ```
- [ ] **Step 3**: Record both results (OK/exception text) verbatim in the evidence doc.

## Task 7: Evidence doc + `pnpm` shields

**Files:**
- Create: `docs/runbooks/red-demo-seed-evidence.md` (mirrors `docs/runbooks/hitl-28-evidence.md`'s
  structure: baseline, dump path, stage log, denial-suite result)

- [ ] **Step 1**: Write the evidence doc: dump path + manifest counts, the exact rows created (gym
  id/slug, membership, host mapping, 4 class_type/3 coach/3 paquetes+marketing+features, 1 template
  + N materialized sessions + 1 evento especial), the gym-content deferral note (if applicable),
  and Task 6's two check results.
- [ ] **Step 2**: Run `pnpm lint && pnpm typecheck && pnpm test` from the worktree root — expect
  exit 0 (this slice ships no app-code diff, so these should be a no-op pass against the inherited
  base + merge).
- [ ] **Step 3**: `git add docs/runbooks/red-demo-seed-evidence.md
  docs/superpowers/plans/2026-07-05-slice-45-red-demo-twin.md` and commit:
  `docs(evidence): red-demo gym twin seeded — closes #45`.

## Self-review notes

- Spec coverage: gym+membership+host (AC1), catalog+plan+week seed (AC2), denial check (AC3),
  evidence+dump (AC4) — all four acceptance criteria have a task.
- No new abstractions, no schema/migration changes, no `packages/brand` touch — matches the
  issue's stated scope exactly.
- Gym-content is explicitly conditional per the issue's own instruction — not a gap.
