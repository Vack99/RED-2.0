# Issue #28 — Live RLS Cutover (two-stage contract) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the contract half of the ADR-0013 §5 expand/contract cutover on the live prod DB — drop the 21 legacy per-`auth.uid()` policies and all 7 `user_id` columns — with every destructive step rehearsed on a preview branch and human-approved before touching live.

**Architecture:** Two separately-gated migrations (A: reversible policy contract; B: irreversible column contract), per the 2026-07-05 opus elegance-panel D4 verdict. The denial suite (`pnpm test:denial`) is the machine gate at every stage; the human is the only executor of live changes. Both migration files stay OUT of `supabase/migrations/` until their branch gates pass (a recreated preview branch replays the whole folder).

**Tech Stack:** Supabase Postgres (live ref `hjppxawglmukfvsgmcog`), Supabase Management API (denial-suite runner), Supabase MCP (`apply_migration` for the human-approved live steps), Vitest/pnpm monorepo.

## Global Constraints

- **NEVER run destructive SQL against `hjppxawglmukfvsgmcog` autonomously.** Live applies happen only at the two human gates, via MCP `apply_migration` calls the human approves individually.
- `SUPABASE_ACCESS_TOKEN` is read from `apps/admin/.env.local` at invocation time (never printed); `SUPABASE_PROJECT_REF=hjppxawglmukfvsgmcog` passed inline.
- Migration A and B files live in **untracked `supabase/cutover/`** until their gates pass; they move into `supabase/migrations/` (filenames reconciled to live-recorded versions — the established de-collide pattern) only after live apply.
- ADR-0013 invariants: never drop `SECURITY DEFINER` from helpers; never unwrap `(select helper(gym_id))`; never widen anon reads past `gym`/`gym_domain`; all new function bodies schema-qualify (`public.is_staff_of`) because `search_path=''`.
- `clientes_member_select` (qual `auth_user_id = (select auth.uid())`) and `gym_membership_self_select` **MUST SURVIVE** — they mention `auth.uid()` but are not legacy.
- Keep-it-lean: contract = deletion; no replacement index for `asistencias_user_fecha_idx` (D1: no query filters on user_id), no new abstractions.
- #27 (custom SMTP) is owner-deferred: live register→claim runs on the default sender (~2 emails/hr, spam-folder caveat). The "auth mail from custom sender" AC is annotated WAIVED, not checked.

---

### Task 1: Author Migration A — reversible policy contract (`supabase/cutover/migration_a_policy_contract.sql`)

**Files:**
- Create: `supabase/cutover/migration_a_policy_contract.sql`
- Create: `supabase/cutover/rollback_a_recreate_legacy_policies.sql` (verbatim legacy CREATE POLICY block from the base migrations — the rollback artifact)
- Create: `supabase/cutover/apply-sql.mjs` (~30-line sibling of the runner's `runSql`: `node apply-sql.mjs <branch-ref> <file.sql>` via Management API — branch applies only; refuses the parent ref)

**Content of Migration A — exactly this, nothing else:**

The 21 policy drops (names verified against the live catalog 2026-07-05; space-named ones quoted):

```sql
drop policy "asistencias_insert_own"   on public.asistencias;
drop policy "asistencias_select_own"   on public.asistencias;
drop policy "asistencias_update_own"   on public.asistencias;
drop policy "clientes_insert_own"      on public.clientes;
drop policy "clientes_select_own"      on public.clientes;
drop policy "clientes_update_own"      on public.clientes;
drop policy "cobro owner insert"       on public.cobro;
drop policy "cobro owner select"       on public.cobro;
drop policy "cobro owner update"       on public.cobro;
drop policy "paquetes_insert_own"      on public.paquetes;
drop policy "paquetes_select_own"      on public.paquetes;
drop policy "paquetes_update_own"      on public.paquetes;
drop policy "perfil_insert_own"        on public.perfil;
drop policy "perfil_select_own"        on public.perfil;
drop policy "perfil_update_own"        on public.perfil;
drop policy "plantillas owner delete"  on public.plantillas;
drop policy "plantillas owner insert"  on public.plantillas;
drop policy "plantillas owner select"  on public.plantillas;
drop policy "plantillas owner update"  on public.plantillas;
drop policy "ventas_insert_own"        on public.ventas;
drop policy "ventas_select_own"        on public.ventas;
```

Plus M1 (review item 4) — revoke lingering anon EXECUTE:

```sql
revoke execute on function public.actualizar_cliente(uuid, text, text) from anon;  -- live signature (3-arg); a 7-arg overload does NOT exist
revoke execute on function public.actualizar_plantilla(uuid, text, text) from anon;
revoke execute on function public.crear_plantilla(text, text) from anon;
revoke execute on function public.eliminar_plantilla(uuid) from anon;
revoke execute on function public.sembrar_plantillas_default() from anon;
```

(Authorship agent verifies each signature against the live catalog before finalizing; if a live signature differs, the live one wins.)

**Steps:**
- [ ] Author the three files (subagent, opus, with `supabase-postgres-best-practices-RED`)
- [ ] Cross-check the 21 names + 5 revoke signatures against the live `pg_policies`/`pg_proc` snapshot (read-only)
- [ ] Orchestrator gate: diff review — Migration A touches policies + grants ONLY

### Task 2: Author Migration B — irreversible column contract (`supabase/cutover/migration_b_column_contract.sql`)

**Files:**
- Create: `supabase/cutover/migration_b_column_contract.sql`

**Content spec (single transaction; order matters):**
1. `create or replace` the 4 write RPCs from their **CURRENT LIVE bodies** (live version `20260703015125` — NOT the repo S5 file, which is stale), each minus `user_id`:
   - `registrar_venta`: remove `user_id` from both INSERT column lists + `v_uid` from both VALUES. **KEEP `v_uid` and its `if v_uid is null` auth guard** (D1 risk b).
   - `toggle_pase`: remove `user_id`/`v_uid` from the `asistencias` INSERT (same guard rule).
   - `crear_plantilla`: cap check becomes `where gym_id = v_gym` (per-gym). One-line comment: per-gym cap is a deliberate semantics shift, inert today (one operator per gym), diverges with a 2nd operator.
   - `sembrar_plantillas_default`: exists-check becomes `where gym_id = v_gym`; remove `user_id` from the 4 seed INSERTs.
   - `reclamar_o_crear_cliente` (**F1, 2026-07-05 review**): the Task-4-applied body's fresh-create path INSERTs `user_id` into `clientes` — rewrite byte-identical minus `user_id` + its leading `v_uid` value (KEEP `auth_user_id = v_uid`, all guards, SECURITY DEFINER, `search_path=''`). Without this, live `/registro` breaks at runtime post-drop (plpgsql is late-bound) and every recreated preview branch is poisoned.
2. `next_folio` guard (D3, review item I2): first statement of body —
   ```sql
   if not public.is_staff_of(p_gym) then
     raise exception 'next_folio: caller is not staff of gym %', p_gym;
   end if;
   ```
3. The column drops (FKs and `asistencias_user_fecha_idx` auto-drop with the columns; no separate DDL):
   ```sql
   alter table public.clientes    drop column user_id;
   alter table public.ventas      drop column user_id;
   alter table public.asistencias drop column user_id;
   alter table public.perfil      drop column user_id;
   alter table public.plantillas  drop column user_id;
   alter table public.cobro       drop column user_id;
   alter table public.paquetes    drop column user_id;
   ```

**Steps:**
- [ ] Fetch the 5 current live function bodies (read-only `pg_proc` query) — never rewrite from repo files
- [ ] Author the migration (subagent, opus, `supabase-postgres-best-practices-RED`)
- [ ] Orchestrator gate: diff each rewritten body against its live original — the ONLY changes are the user_id removals, the two per-gym predicate switches, and the next_folio guard

### Task 3: Author staged I4 denial vectors + ADR-0009 amendment

**Files:**
- Create: `supabase/tests/contract_a_denials.sql` (green post-A; NOT wired into SUITE until after the BEFORE run): anon-calls-legacy-RPC denial ×5; staff-of-A direct INSERT with `gym_id=B` → with_check denial (fixture supplies `user_id` — column still exists at stage A).
- Create: `supabase/tests/contract_b_denials.sql` (green post-B; wired after the fixture rewrite): `next_folio(gymB)` raises for BOTH a member caller and a wrong-gym staff caller (D3 risk 2).
- Modify: `docs/adr/0009-*.md` — amendment recording I1 accurately (per D2 verdict): open-enrollment is a **SECURITY DEFINER write vector** (verified-email user can mint `clientes` + `gym_membership(member)` rows into any `gym_id`; CRM-pollution, scriptable — gym rows anon-readable, email confirmation global). Bounded: no member PII, no cobro, no cross-member reads, no tenant-table writes on the RLS surface. Accepted-debt with un-defer trigger (>1 live gym or first abuse report); real mitigation = invitation/allowlist row or service-role-signed gym proof (naive p_gym_id guard is a non-fix). Separate flag note: `plantillas_member_select` exposes operator WhatsApp templates to members — revisit.

**Steps:**
- [ ] Author both vector files following the suite's BEGIN/ROLLBACK self-asserting fixture pattern (copy conventions from `rls_cross_tenant_denial.sql`)
- [ ] Author the ADR-0009 amendment
- [ ] Orchestrator gate: vectors are transaction-local, zero prod UUIDs, RAISE on failure

### Task 4: PRE-STEP (HUMAN) — apply claim RPC to live

- [ ] Human approves MCP `apply_migration` of the exact content of `supabase/migrations/20260702231500_reclamar_o_crear_cliente_rpc.sql` (additive; unblocks `/registro`)
- [ ] Reconcile the repo filename to the live-recorded version (de-collide pattern) in the same commit as the later cutover files
- [ ] Verify `pg_proc` now has `reclamar_o_crear_cliente` (read-only)

### Task 5: Branch BEFORE gate

- [ ] Delete stale `denial-suite` preview branch (MCP `list_branches` → `delete_branch`) — branch only, never the parent
- [ ] Run the suite (recreates branch with the full current migration set incl. claim RPC):
  ```powershell
  $tok = (Get-Content apps\admin\.env.local | Where-Object { $_ -match '^SUPABASE_ACCESS_TOKEN=' }) -replace '^SUPABASE_ACCESS_TOKEN=',''
  $env:SUPABASE_ACCESS_TOKEN = $tok; $env:SUPABASE_PROJECT_REF = 'hjppxawglmukfvsgmcog'; pnpm test:denial
  ```
  Expected: all 6 files PASS → **green BEFORE recorded** (dual-policy state)

### Task 6: Branch rehearsal — AFTER-A, fixtures, AFTER-B, gym-#2 probe

- [ ] Apply Migration A to the BRANCH (`node supabase/cutover/apply-sql.mjs <branch-ref> supabase/cutover/migration_a_policy_contract.sql`)
- [ ] Run suite UNCHANGED → green **AFTER-A** (apples-to-apples: any red in an unchanged file = real leak)
- [ ] Wire `contract_a_denials.sql` into the runner's SUITE array → suite green again
- [ ] Fixture rewrite sweep (Task 11 in the session tracker): remove `user_id` from every fixture INSERT in all suite files incl. `contract_a_denials.sql`
- [ ] Apply Migration B to the BRANCH; wire `contract_b_denials.sql` → full suite green **AFTER-B**
- [ ] Synthetic gym-#2 probe on the branch: self-register → claim seeded row → gym-scoped read → one sale; folios sequence independently; dates render in `America/Mexico_City`
- [ ] Record all outputs

### Task 7: LIVE gates (HUMAN, two separate approvals)

- [ ] Catalog snapshot BEFORE-A recorded (pg_policies for the 7 tables + pg_attribute user_id presence + get_advisors)
- [ ] **GATE 1:** human approves MCP `apply_migration` of Migration A to live. Rollback if needed: `rollback_a_recreate_legacy_policies.sql`
- [ ] Snapshot AFTER-A; human exercises Forge admin ops in prod (login, agenda, one sale, plantillas) — healthy
- [ ] **GATE 2:** human approves MCP `apply_migration` of Migration B to live (one transaction; mid-apply failure auto-rolls-back; committed = PITR-only)
- [ ] Snapshot AFTER-B: **zero per-`auth.uid()` policies, zero `user_id` columns** (the AC catalog proof); get_advisors — multiple_permissive WARNs + 6 unindexed-FK INFOs cleared
- [ ] Commit: A + B into `supabase/migrations/` (live-recorded version filenames) + fixture rewrites + vector wiring + runner SUITE array + claim-RPC filename reconcile

### Task 8: Deploy-verify runbook (`docs/runbooks/hitl-28-live-cutover-deploy-verify.md`)

- [ ] Author: clone the hitl-16 structure, replacing the static host-map leg with a NEW `gym_domain`-resolution leg (hitl-16 predates the DB-backed resolver); region co-location already recorded there — verify, don't redo
- [ ] Human walks it: real hosts resolve from `gym_domain`; Forge admin ops green in prod; register→claim live on a real host (default sender: ≤2 emails/hr, check spam folder; one clean pass suffices)

### Task 9: Exit

- [ ] `improve-database-architecture` post-cutover audit; findings recorded/triaged
- [ ] Regenerate `database.types.ts` (still lists `user_id` as required Insert field)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` green (Vitest 319)
- [ ] Close #28 with evidence; annotate custom-sender AC as WAIVED per #27 deferral; #27 stays open-deferred
