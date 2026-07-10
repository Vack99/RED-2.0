# Context pack — S10 / issue #28: live RLS cutover + deploy-verify (terminal gate)

> **For:** a fresh execution session (planned model: **fable-5**) that will *drive the human through* issue #28.
> **Prepared:** 2026-07-04, on `main @ a425dd0`. This file gathers everything the executing session needs; it
> **references** the canonical artifacts (issue, ADRs, PRD, runbooks, migrations) rather than restating them —
> open them, don't trust a paraphrase.
>
> **Read this first, then the issue, then ADR-0013 §5, then the hitl-16 runbook.** Nothing here overrides those.

---

## 0. What #28 actually is (and what the agent must NOT do)

Issue: **S10 — [HITL] Live cutover: drop per-`auth.uid()` policies + `user_id` columns; deploy-verify (terminal gate)**
→ https://github.com/Vack99/RED-2.0/issues/28 (read the body + AC in full; do not duplicate here).

It is the **contract half** of the ADR-0013 §5 expand/contract cutover, executed **on the live prod DB**, plus the
terminal deploy-verify runbook. It is labeled `hitl` because three of its acts are **human-only**:

- **Approving + executing DESTRUCTIVE prod SQL** (drop 21 per-`auth.uid()` policies; drop the redundant `user_id`
  columns).
- **Live-host provisioning** (real domains resolve from `gym_domain`).
- **Walking the deploy-verify runbook** with human eyes on "it works live."

**The role of the fable session is orchestration + authorship, not autonomous execution:** prepare the exact SQL,
the catalog verification queries, the cloned runbook, and the gates — then **the human approves and runs the
destructive steps.** Never fire the drops autonomously against `hjppxawglmukfvsgmcog` (the live project). This is
stated in the issue and in the goal file (`docs/prompts/goal-platform-phase3-rls.md:99`).

---

## 1. Where the work sits — everything upstream is DONE and LIVE

All nine AFK slices of Phase 3 (#18–#26) are closed and merged to `main`. The **expand half is applied to the live
prod DB** — verified 2026-07-04 via `list_migrations` on `hjppxawglmukfvsgmcog`:

| Blocker | Slice | State | Note |
|--------|-------|-------|------|
| #22 | S7 resolveTenant / `x-gym`+`x-brand` / HOST_TO_BRAND deleted | CLOSED, merged | |
| #23 | S4 gym-scoped RLS policies (EXPAND) — `cobro` owner-only | CLOSED, **live** | migration `20260702173309_gym_scoped_rls_policies` applied |
| #24 | S5 per-gym folio + `registrar_venta` rewire + 4 `user_id` re-keys | CLOSED, **live** | migration `20260702231021_s5_per_gym_folio_and_rekeys` applied |
| #25 | S6 per-gym timezone | CLOSED, merged | |
| #26 | S8 member self-register + claim RPC | CLOSED, merged | ⚠️ **RPC may NOT be live** — see §4 |
| **#27** | **S9 custom SMTP (`hitl`)** | **OPEN** | **blocks #28 — see §2** |

So the live DB is currently in the **dual-policy state**: permissive policies OR together, so the lone Forge
operator still works via the old per-`auth.uid()` predicate **and** gym-scoped access is live. #28 removes the old
half. Read the expand migration to see exactly what was added:
`supabase/migrations/20260702173309_gym_scoped_rls_policies.sql`.

---

## 2. HARD ORDERING GATE: #27 (SMTP) must finish before #28's live-registration steps

#28 is **blocked by #27** (still OPEN). #27 stands up Resend custom SMTP so real member registrations can send
confirmation mail (Supabase's built-in mailer dies ~member #30 — audit finding 3). #28's deploy-verify includes
**"register→claim live on real hosts"** and **"auth mail from the custom sender"** — those steps cannot pass until
#27 is done.

**Recommended execution order for the fable session:**
1. First drive **#27** to green (runbook already written: `docs/runbooks/smtp-resend.md` — human does vendor/DNS/
   templates/inbox; two flagged decisions to confirm: sender display name `Notificaciones`, rate limit 30/hr).
2. Then run `superpowers:requesting-code-review` on the **full RLS policy surface** (highest-stakes surface, required
   before the drop — goal file `:182`).
3. Then drive **#28**: the destructive contract + deploy-verify.

The DB-only portion of #28 (denial suite before → drop policies/columns → denial suite after → synthetic gym-#2
probe on a preview branch) does **not** depend on #27 and can be rehearsed first on a preview branch. Only the
**live real-host register/claim + auth-mail** legs need #27 live.

---

## 3. The exact surface #28 touches

### 3a. Policies to drop — the 21 per-`auth.uid()` policies
The old single-operator policies of the form `using ((select auth.uid()) = user_id)` on the 7 tenant tables
(`clientes`, `ventas`, `asistencias`, `perfil`, `plantillas`, `cobro`, `paquetes`). Their originals are in the
base table migrations (`supabase/migrations/20260530*.sql`, `create_perfil`, `create_ventas_core`, etc.).

**Do not hand-enumerate from the repo — the drop set must be derived from the LIVE catalog** (repo files have
version drift from live; see §4). Query `pg_policies` on the live project for policies whose `qual`/`with_check`
reference `auth.uid()` **directly against `user_id`** (NOT the gym-scoped ones, which wrap `is_staff_of`/
`is_member_of`/`has_role`). The AC requires: **"Zero per-`auth.uid()` policies … remain (catalog query recorded)."**
Record the pg_policies snapshot BEFORE and AFTER.

### 3b. `user_id` columns to drop — VERIFY before dropping; landmine below
The issue says drop "the redundant `user_id` columns freed by the re-keys." The S5 re-keys
(`20260702231021_s5_per_gym_folio_and_rekeys.sql`) moved three uniques off `user_id`:
`perfil unique(user_id)→unique(gym_id)`, `cobro unique(user_id)→unique(gym_id)`,
`paquetes unique(user_id,nombre)→unique(gym_id,nombre)` (+ the `paquetes_one_popular` partial index per-gym).
So the columns *freed from a constraint* are **`perfil.user_id`, `cobro.user_id`, `paquetes.user_id`**.

> ⚠️ **LANDMINE — do NOT blindly drop every `user_id`.** In the S5 migration body, `registrar_venta` still
> **INSERTs `user_id`** into both `clientes` and `ventas` (lines ~107 and ~125). If the live function still writes
> those columns, dropping `clientes.user_id` / `ventas.user_id` will **break sales**. Before dropping ANY `user_id`
> column: (a) confirm no live policy still references it (they drop in 3a first), and (b) confirm no live RPC still
> writes/reads it — check the **newest** function bodies (`membership_derived_gym_in_write_rpcs`, live version
> `20260703015125`, is newer than the S5 body — the S5 excerpt may be stale). Drop only columns that are provably
> unreferenced by both policies and RPCs. Record the catalog proof.

### 3c. The denial suite — the machine gate (run green BEFORE and AFTER the drop)
- Runner: `supabase/tests/run-denial-suite.mjs` (also `pnpm test:denial`).
- Suite files: `supabase/tests/{rls_cross_tenant_denial,gym_tenant_anon_read,gym_membership_rls,folio_per_gym,rekey_gym_scoped,registro_claim}.sql`.
- **It runs against a seeded Supabase PREVIEW BRANCH, never live** (`create_branch` applies all migrations to a
  fresh branch DB; fixtures are transaction-local, zero prod UUIDs). Needs env:
  `SUPABASE_ACCESS_TOKEN` (a Management-API PAT) + `SUPABASE_PROJECT_REF` (the parent ref `hjppxawglmukfvsgmcog`).
- **Gotcha for THIS slice:** the preview branch is provisioned from the current migration set (dual-policy). To get
  a green-AFTER reading, the branch must have the drop applied too. Rehearse the whole cutover on the branch first
  (apply drops there, suite green), THEN do the human-approved live drop, THEN re-run/record against live-equivalent
  state. Confirm how the runner reuses vs. resets the `denial-suite` branch before relying on a stale branch.

### 3d. Synthetic gym-#2 probe (on the seeded branch, non-Chihuahua zone)
self-register → claim a seeded row → gym-scoped read → one sale; **observe**: folios sequence independently per gym,
dates render in gym #2's zone (e.g. `America/Mexico_City`). Prior art fixtures already in the suite; see
`supabase/tests/toggle_pase_gym2_timezone.sql` and `folio_per_gym.sql`.

### 3e. Deploy-verify runbook — CLONE hitl-16
`docs/runbooks/hitl-16-vercel-deploy-verify.md` is the pattern to clone (region co-location is already recorded
there — verify, don't redo). The #28 runbook checklist (from the issue AC): real hosts resolve from `gym_domain`;
Forge admin ops green in prod; register→claim live on real hosts; auth mail from the custom sender. Write the new
runbook as `docs/runbooks/hitl-28-live-cutover-deploy-verify.md`.

### 3f. Post-cutover exit audit
Run the `improve-database-architecture` skill as the post-cutover audit; record/triage findings. Also
`get_advisors` after the drops (advisors clean is an AC).

---

## 4. Live-DB findings the executing session MUST re-verify (state as of 2026-07-04)

1. **Migration version drift, repo ↔ live.** Several repo migration filenames carry different timestamps than the
   applied live versions (the "de-collide" from commit `70a7f67`). Examples from `list_migrations`: repo
   `20260602120000_actualizar_cliente_rpc` is live as `20260602190009`; the plantillas/paquetes slices likewise.
   **Consequence:** never derive the live drop set from repo files — query the live catalog (§3a/§3b).
2. **The register/claim RPC (#26) may NOT be applied to live.** The repo has
   `supabase/migrations/20260702231500_reclamar_o_crear_cliente_rpc.sql`, but the live `list_migrations` output has
   **no `reclamar_o_crear` entry** (it jumps `…231021_s5…` → `…20260703015125_membership_derived…`). Memory also
   flagged this ("#26's claim RPC not yet applied to live"). **The live register→claim deploy-verify leg cannot pass
   until this RPC is applied to prod.** Confirm presence with a live catalog check (`pg_proc` for
   `reclamar_o_crear_cliente`) and apply it if missing, before the register/claim verify step.
3. **Expand half IS live** — `20260702173309_gym_scoped_rls_policies` and `20260702231021_s5_per_gym_folio_and_rekeys`
   are both in the live list, so the dual-policy state is real and the contract is validly the next step.

Re-run `list_migrations` + the `pg_policies` / `pg_proc` catalog queries live at the start of the session — this
snapshot will be days old by execution time.

---

## 5. Gate sequence for #28 (mirror of the issue AC — tick in order)

1. `superpowers:requesting-code-review` on the full RLS policy surface (before any drop).
2. **Denial suite green BEFORE** (recorded, on the current dual-policy state).
3. **Human approves + executes** the destructive drops (21 policies, then the verified-redundant `user_id` columns).
4. **Denial suite green AFTER** (recorded).
5. **Catalog proof recorded:** zero per-`auth.uid()` policies, zero redundant `user_id` columns.
6. **Synthetic gym-#2 probe** passes end-to-end on the seeded branch (register, claim, scoped read, sale;
   independent folios; gym-#2 timezone).
7. **Live deploy-verify runbook** complete: real hosts resolve from `gym_domain`; Forge admin ops green in prod;
   auth mail from the custom sender; register→claim live.
8. **Post-cutover `improve-database-architecture` audit** run; findings recorded/triaged. `get_advisors` clean.
9. **Forge test suite green** (Vitest 319 + lint + typecheck via pre-commit).
10. Close #28 (and #27) with evidence recorded.

---

## 6. Reference index (open these — do not rely on paraphrase)

- **Issue #28** — https://github.com/Vack99/RED-2.0/issues/28 · **#27** — https://github.com/Vack99/RED-2.0/issues/27
- **PRD #17** — `docs/prds/prd-tenant-rls.md` (S10 = §"Further Notes" slice list; the RLS/cutover discipline)
- **ADR-0013** — `docs/adr/0013-gym-scoped-rls-mechanism.md` (§5 = cutover discipline; §"What a future reader must
  not undo" = the invariants the drop must not violate — never drop `SECURITY DEFINER`, never unwrap
  `(select helper(gym_id))`, never widen anon reads past `gym`/`gym_domain`)
- **ADR-0009 / ADR-0008 / ADR-0014** — identity/claim · isolation-is-RLS-never-the-host · custom SMTP
- **Goal file** — `docs/prompts/goal-platform-phase3-rls.md` (`:17,:99,:168,:182` = the #27/#28 HITL handling)
- **Runbook to clone** — `docs/runbooks/hitl-16-vercel-deploy-verify.md`
- **SMTP runbook (#27)** — `docs/runbooks/smtp-resend.md`
- **Expand migration (what gets contracted)** — `supabase/migrations/20260702173309_gym_scoped_rls_policies.sql`
- **Re-key migration (freed columns)** — `supabase/migrations/20260702231021_s5_per_gym_folio_and_rekeys.sql`
- **Denial suite** — `supabase/tests/run-denial-suite.mjs` + the six `*.sql` files in `supabase/tests/`
- **Accepted-debt ledger** — `docs/health/accepted-debt.md` (the unpaged clientes readers stay deferred debt — NOT in scope)

---

## 7. Suggested skills for the executing session

Invoke in this order as the work reaches each stage:

- **`superpowers:writing-plans`** — turn this pack + the issue into the concrete cutover plan before touching prod.
- **`supabase-postgres-best-practices-RED`** — on every SQL/catalog/policy touch (the drops, the catalog queries).
- **`superpowers:requesting-code-review`** — on the full RLS policy surface BEFORE the drop (required, §5.1).
- **`superpowers:test-driven-development`** — denial-suite-first discipline (green before AND after).
- **`superpowers:verification-before-completion`** + **`verify`** — evidence (catalog snapshots, suite output,
  live-host checks) before any "done" claim; this is a destructive prod change — no assertion without output.
- **`improve-database-architecture`** — the post-cutover exit audit (§3f, AC).
- **`keep-it-lean`** — the contract step is a deletion; resist adding scope.
- Supabase MCP tools: `list_migrations`, `execute_sql` (read-only catalog queries live; **destructive DDL only on
  human approval**), `create_branch` + `get_advisors` for the denial-suite branch.

---

## 8. Open questions to settle with the human at the top of the session

1. **Is #27 (SMTP) done or being done in the same session?** #28's real-host register/claim + auth-mail legs are
   blocked on it (§2). Decide whether to close #27 first or interleave.
2. **The two `user_id`-column ambiguity (§3b):** confirm the executing session will derive the exact drop list from
   the live catalog + newest RPC bodies, and will NOT drop `clientes.user_id`/`ventas.user_id` if `registrar_venta`
   still writes them.
3. **Is `reclamar_o_crear_cliente` applied to live? (§4.2)** If not, apply it before the register/claim verify.
4. **Live hosts + Vercel access for the deploy-verify** — which real hostnames, and are the `gym_domain` rows for
   them present? (hitl-16 provisioned forge/red client hosts; #28 verifies register/claim on them.)
5. **Env for the denial suite** — the human has `SUPABASE_ACCESS_TOKEN` (the AFK env did not; see `smtp-resend.md`
   §"What the agent could NOT automate"). Confirm it's available for the preview-branch runs.
