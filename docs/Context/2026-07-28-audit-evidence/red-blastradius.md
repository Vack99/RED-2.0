# red:blastradius — one project, one blast radius

**Agent:** `red:blastradius` · **Date:** 2026-07-28 · **Target:** ≥3,000 gyms × 150–300 members
**Access:** live prod `hjppxawglmukfvsgmcog`, read-only (SELECT / pg_catalog / advisors / list_branches). Repo at `C:/Users/Aaron/Documents/Repos/RED-2.0`. Vendor pages fetched 2026-07-28 (Supabase docs) / carried from Workflow 1 where noted with its fetch date.
**Mandate:** (1) what takes down all 3,000 at once, (2) the per-tenant recovery story, (3) the real RTO/RPO, (4) the unauthenticated security blast radius. Ranked 5 worst, worst first.

---

## 0. Headline

The database has a competent tenant boundary and a genuinely good shield inventory (RLS on 29/29 tables, an `ensure_rls` event trigger, `search_path=''` on every function, a folio counter that is deny-all except through a DEFINER). None of that is the blast radius.

The blast radius is that **there is no way back**. I measured three independent facts that compound:

1. **Prod's schema cannot be rebuilt from source control.** 87 migration files in the repo, 87 rows in prod's ledger, **22 of 87 versions match (25%)**. 65 repo files are not recorded as applied; 65 applied versions do not exist as files.
2. **There is no import path for any of the 29 tables.** The one export (`/cuenta/respaldo`) covers 4 of 29 tables, drops every primary key, and denormalizes foreign keys to display names.
3. **Physical PITR/backup can only roll back all 3,000 tenants together** — and which of those two mechanisms even exists is still unresolved (§3).

So the defensible statement is: **RTO for "one gym's data came back" is ∞ (no mechanism exists). RTO for "the platform came back" is 4–24 h and depends on a vendor mechanism nobody in this repo has ever exercised.** Everything below is the evidence.

One correction to Workflow 1 up front: it claimed a per-tenant export "exists for 0 of 28 tables." **That is wrong** — an export exists for 4 tables and it is well-engineered. It is the *import* that is 0 of 29, and the export is lossy in a way that matters (§2.2).

---

## 1. WHAT TAKES DOWN ALL 3,000 GYMS AT ONCE

Every row below is a mechanism that has no tenant-scoped containment: it is architecturally incapable of failing for one gym only.

| # | Single point of failure | Likelihood | Detection time | Recovery time | Any per-tenant mitigation? |
|---|---|---|---|---|---|
| 1 | **A migration applied via MCP `apply_migration`** — runs as `postgres` (table owner), `relforcerowsecurity=false` on 29/29 tables ⇒ **RLS bypassed**, touches every tenant's rows in one statement. No CI gate (§1.1). | **High** — this is the normal shipping path, used ~87 times | Minutes–days (no alerting exists, §1.6) | Unbounded (see §3) | **None.** No staging DB, no canary tenant, no dry-run. |
| 2 | **A bad RLS policy / a dropped `.eq("gym_id")`** — the tenant discriminator is a hashed SubPlan *filter*, never an index cond (arch-tenancy §1.2, verified there with `enable_seqscan=off`). A policy edit that widens `USING` leaks every tenant instantly. | Medium | Only if someone notices wrong data | Minutes to revert; the leak is not undoable | None. 101 policies, all hand-written. |
| 3 | **The shared Resend identity** — ONE account, ONE domain `ibookit.lat`, ONE API key that is *simultaneously* the Supabase custom-SMTP password and `RESEND_API_KEY` (runbook §A4, quoted §1.3). A suspension kills auth mail + invites + receipts for all tenants at once. | **High** — trips on *rolling-window* bounce rate, so it does not dilute with scale | Hours (user reports) | Days (reputation remediation) | **None.** No per-tenant subdomain, no suppression list, no per-tenant key. |
| 4 | **The project-wide auth-email bucket** — 50/hour, set in Supabase Auth, shared by every tenant (runbook line 32). Resend Free's **100/day** binds first. | Certain at scale | Immediate (users can't log in) | Instant if you pay; the cap is the design | **None.** One bucket, 3,000 tenants. |
| 5 | **Disk read-only mode from an unauthenticated attacker** — `enviar_mensaje_contacto` is anon-EXECUTE + SECURITY DEFINER and its rate limit is skippable (§4.2). | Medium (trivially exploitable, low motive today) | Minutes–hours | Hours (delete rows) — but **disk growth is a one-way ratchet** (price-compute §2) | None. One shared table, one shared disk. |
| 6 | **A compute resize** — Supabase docs: *"Compute instance changes are usually applied with less than 2 minutes of downtime"* and *"Compute sizes are not auto-upgraded because of the downtime incurred"* (price-compute §1, fetched 2026-07-27). Every capacity increase is a planned platform-wide outage someone must notice is needed. | Certain (required to scale) | N/A (deliberate) | ~2 min, all tenants | None. |
| 7 | **The shared Vercel deployment** — one deployment per app, all hosts `*.ibookit.lat`, no `vercel.json`, no per-tenant build. A bad deploy is a 3,000-gym outage. | Medium | Fast if anyone is watching | **Seconds** (Vercel instant rollback) | None — **but this is the one SPOF with a genuinely good recovery story.** |
| 8 | **DNS / the `ibookit.lat` registrar** — every tenant host is a subdomain of one apex (runbook §"Known hosts"). Workflow 1 is right that there are no BYO domains. | Low | Minutes | Hours (TTL 3600s per runbook A2) | None. |
| 9 | **One saturating query** — `statement_timeout=120000` (measured). Any query can hold a pooled connection for 2 minutes; PostgREST's pool is shared across all tenants. | Medium | None (no slow-query log: `log_min_duration_statement = -1`, measured) | Minutes | None. |
| 10 | **A leaked `service_role` key** — used in `supabase/functions/activar-cuenta/index.ts` and `tools/perf/*`. It bypasses RLS entirely on all 29 tables. | Low | **Zero — nothing detects it** | Rotation is fast; the exfiltration is not undoable | None. |

### 1.1 The ungated write path — verified

`.github/workflows/ci.yml` runs exactly: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. **No database step, no `test:denial`.** `AGENTS.md` states this deliberately: *"`test:denial` itself is **not** in CI or pre-commit."*

But the sharper point is that CI is not even on the path. Migrations reach production through the MCP's `apply_migration` against the live ref (recorded in the session memory: *"`.mcp.json` points the MCP at prod … apply_migration hits live"*). That call does not pass through GitHub Actions at all. **The number of automated checks between an agent's DDL and 3,000 tenants' rows is zero.**

And it runs privileged:

```sql
select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c ... where n.nspname='public';
-- 29 rows: rls_on = true, rls_forced = FALSE  (all 29)
```

PostgreSQL 17 docs, https://www.postgresql.org/docs/17/ddl-rowsecurity.html (fetched 2026-07-28):
> *"Table owners normally bypass row security as well, though a table owner can choose to be subject to row security with ALTER TABLE ... FORCE ROW LEVEL SECURITY."*

The tables are owned by `postgres` (from `relacl`: `postgres=arwdDxtm/postgres`), which is the role migrations run as. So **a migration's `UPDATE`/`DELETE` sees all 3,000 tenants with no boundary at all** — RLS is not merely bypassed by accident, it is documented not to apply.

### 1.2 The schema is not reproducible — measured

```sql
select count(*), min(version), max(version) from supabase_migrations.schema_migrations;
-- 87 | 20260530004747 | 20260724131805
```
Repo: `ls -1 supabase/migrations/*.sql | wc -l` → **87**; newest file `20260722120000_reclamar_por_codigo_firma.sql`.

Set-diffing the 87 prod versions against the 87 repo filename timestamps:

| | count |
|---|---|
| In repo, **not** in prod ledger | **65** |
| In prod ledger, **not** in repo | **65** |
| Matching both sides | **22** (25%) |

Prod's newest applied version (`20260724131805`) postdates the repo's newest file (`20260722120000`) — production is *ahead* of source control by a restamped application of the same change. This is the documented consequence of `apply_migration` restamping (session memory, "prod migration version drift"), and I confirmed the magnitude live rather than trusting it.

**Why this is the #1 blast-radius fact:** every recovery story that isn't "Supabase restores the exact project" requires replaying the schema. `supabase db push` into a fresh project would replay all 87 repo files including seeds, producing a schema that is *not* prod's, and the ledger cannot tell you which file corresponds to which applied version. **There is no known-good rebuild artifact in this repo.**

### 1.3 The shared email identity — verified against the runbook, not inferred

`docs/runbooks/hitl-72-resend-live.md:59`:
> *"Copy the `re_…` secret once. **Store it for §B (SMTP password) and §D (`RESEND_API_KEY`) — the same key serves both roles.**"*

Line 32:
> *"Auth email rate limit … **`50`/hour** — clears the ~member-#30 wall; one runaway hour still cannot spend more than half Resend's free 100/day."*

So one credential gates: Supabase signup-confirmation, password reset, magic-link activation, invites, and receipts — for every tenant.

**Where it breaks, arithmetically.** Magic link is the sole activation door (session memory: *"/activar is the sole invite door"*). Resend Free = **100 emails/day, 3,000/mo** (alt-email §3, primary-fetched 2026-07-27).

- Platform-wide login/activation ceiling: **100 auth mails/day** across all 3,000 gyms.
- Monthly: 3,000 emails ÷ 3,000 gyms = **1 email per gym per month.**
- At 225 members/gym, onboarding a *single* gym's roster consumes **2.25 days** of the entire platform's email budget.

The 50/hour Supabase setting is not the binding constraint; it is 1,200/day against a 100/day supplier cap. **The platform's real member-onboarding rate is ~100 people/day, total, forever, until this is paid for and split.**

And per alt-email §4.4 (SES enforcement FAQ, fetched 2026-07-27), the bounce gate is computed over *"a representative volume … [that] changes as the user's sending patterns change"* — a rolling window, not a lifetime average. **One gym's dirty roster trips an account-wide suspension identically at 30 gyms or at 3,000.** Growth does not dilute it.

### 1.4 Tenant-subgraph closure — checked, and it is NOT structurally guaranteed

Per-tenant extraction is only well-defined if the tenant subgraph is closed. It is closed *today* (arch-tenancy §1.5 checked all 13 cross-table edges: 0 cross-gym rows) but nothing keeps it closed, and I confirmed the mechanism from primary source:

```sql
select count(*) from pg_constraint where contype='f' and connamespace='public'::regnamespace;
-- 50 FKs, of which 0 are composite (none include gym_id)
```

PostgreSQL 17 docs (same page, fetched 2026-07-28):
> *"Referential integrity checks, such as unique or primary key constraints and foreign key references, **always bypass row security** to ensure that data integrity is maintained."*

So an operator of gym A can insert a `class_session` with `gym_id = A` (passes `is_staff_of(A)` WITH CHECK) whose `class_type_id` belongs to gym B — the FK check will not consult RLS. **The isolation of the extract unit is a discipline property, not a schema property.**

### 1.5 The FK delete topology — the per-tenant destruction paths

Measured, all 50 FKs. The interesting ones:

| Edge | ON DELETE | Consequence |
|---|---|---|
| `gym_membership.user_id → auth.users` | **CASCADE** | Deleting one auth user silently strips their gym memberships |
| `gym.owner_user_id → auth.users` | SET NULL | …and orphans the gym's ownership pointer |
| `clientes.auth_user_id → auth.users` | SET NULL | …and unlinks the member from their roster row |
| `ventas.cliente_id → clientes` | **CASCADE** | Deleting one member destroys their **entire payment history** |
| `asistencias.cliente_id → clientes` | **CASCADE** | …and their entire attendance ledger |
| `reservation.member_id → clientes` | **CASCADE** | …and their reservations |
| `asistencias/reservation.class_session_id → class_session` | **CASCADE** | Deleting sessions destroys the attendance ledger attached to them |
| `clientes/ventas/asistencias/paquetes/perfil/cobro/plantillas/plan_feature .gym_id → gym` | **NO ACTION** | A `delete from gym` **errors out** — money rows block it. This is a real, load-bearing shield. |

**Measured today: `staff_rows = 4` for 4 gyms — exactly one owner/operator account per gym**, and `arch-tenancy §1.6` established that no product surface creates an owner membership (the only `owner` insert in 87 migrations is a seed). So: **delete or lose one `auth.users` row and that gym has zero staff, permanently, with no in-product recovery.** At 3,000 gyms that is 3,000 independent single-account lockout risks whose only remedy is the founder hand-writing SQL against production.

The good news, verified: `clientes` and `ventas` have **no DELETE policy at all** (checked `pg_policies`, all cmds). So the cascade above is not reachable through the app — an operator cannot delete a member. **The realistic in-app destruction verb is `UPDATE`**, and `clientes_staff_update` grants an operator UPDATE on every column of every row in their gym (`nombre`, `tel`, `email`, `clases_restantes`, `vence`). There is no audit table, no soft-delete on `clientes`, and no history anywhere except `asistencias.deleted_at`.

### 1.6 Detection — measured at zero

```
grep -rln "sentry|pagerduty|opsgenie|alertmanager|healthcheck|uptime" apps packages tools .github
→ (no matches)
```
`log_min_duration_statement = -1` (measured) — no slow-query logging. No uptime check, no error tracking, no alert on any of the ten SPOFs above. **Detection time for every row in the §1 table is "when a customer complains," except #7 which is "when the founder happens to load the site."**

---

## 2. THE PER-TENANT RECOVERY STORY

**Scenario: a gym's operator wipes their roster (mass UPDATE blanking `clases_restantes`/`vence`/`nombre`) on Tuesday and asks for it back on Friday. What actually happens today?**

Answer, concretely: **the founder tells them it is gone, or rolls back all 2,999 other tenants to Tuesday.** There is no third option. Here is why, checked rather than assumed.

### 2.1 Physical PITR cannot be tenant-scoped

This is structural, not a gap to be fixed: Supabase's backups are physical (`archive_command = /usr/bin/admin-mgr wal-push …`, measured — WAL-G shipping to object storage). A physical restore restores the *cluster*. There is no per-row, per-tenant, or per-table selectivity. Restoring gym #1,847 to Tuesday means restoring gyms #1–#3,000 to Tuesday and discarding three days of every other tenant's sales.

### 2.2 The one export that exists — 4 of 29 tables, and lossy

Workflow 1 said 0 of 28. **It is 4 of 29.** `apps/admin/src/app/(app)/cuenta/respaldo/route.ts` → `packages/data/src/server/respaldo.ts` → `packages/data/src/server/export/rows.ts` produces an `.xlsx` per gym. It is genuinely well-built: `requireOperator` gate, gym resolved from `auth.uid()` not the host, paginated at `PAGE = 1000` so the ledgers can't silently truncate, `.eq("gym_id")` on every read.

But as a *recovery artifact* it fails on five counts, all read from the code:

| Property | Evidence | Why it breaks recovery |
|---|---|---|
| Covers **4 of 29** tables (`clientes`, `ventas`, `asistencias`, `paquetes`) | `respaldo.ts:177-190` | The entire agenda/schedule/branding/config subgraph — `class_session`, `reservation`, `class_type`, `coach`, `schedule_template*`, `room`, `perfil`, `cobro`, `plan_feature`, `facility`, `faq`, `about_value`, `stat`, `plantillas`, `gym_membership`, `gym_domain`, `gym` — has **no export at all** |
| **Primary keys are dropped** | `shapeClientes` (`rows.ts:174-206`) emits Nombre/Teléfono/Email/…/Alta — **no `id`** | You cannot restore a row and keep its identity |
| **Foreign keys are denormalized to display names** | `rows.ts:163-164`: `nombreDe = (id) => nombrePorId.get(id) ?? "—"`; Ventas and Asistencias sheets emit the member's *name*, not `cliente_id` | The referential graph is destroyed. Two members with the same name are indistinguishable on reimport. **61 of 116 roster rows have `email is null`** (measured) and `clientes` has **no unique constraint except the PK on `id`** (measured) — nothing prevents the collision |
| Values are **display labels, not data** | `METODO_LABEL`, `vigenciaLabel` → `"30 días"`, `ESTADO_LABEL`, `URGENCIA_LABEL` (`rows.ts:96-128`) | `estado`/`urgencia` are *derived at export time*; they are a snapshot of a computation, not restorable state |
| Default window is **últimos 24 meses**, not full history | `respaldo.ts:166` — `getMonth() - 23`; the comment says the unbounded snapshot *"is retired — it 413s at ~3 years"* | Year-3 history is not in the default export; recovering it means 36 separate `?mes=` downloads |

It is also **manual** — an operator must click it. `cron.job` is not present/readable on this project, and nothing schedules it.

### 2.3 The import path — measured at zero

```
grep -rn "readFile|xlsx.read|parse.*csv|bulkInsert|upsert(" packages/data/src apps/admin/src apps/client/src
→ (no matches)
```

**There is no import for any of the 29 tables.** Recovery from the export is a human retyping an Excel sheet into the admin UI, guessing which "Juan Pérez" each sale belonged to, and accepting that folios (`ventas_folio_gym_uq UNIQUE (gym_id, folio)`, measured) will collide with whatever `next_folio` has since issued.

**Honest per-tenant RTO: ∞. There is no mechanism. The best available is a human re-keying a lossy spreadsheet, and it cannot reconstruct the FK graph.**

---

## 3. THE REAL RTO/RPO

### 3.1 What backup mechanism actually exists — measured, then narrowed

Measured (this is not contested — it is in `pg_catalog`):

```sql
select name, setting from pg_settings where name in ('archive_mode','archive_command','archive_timeout','wal_level');
-- archive_mode    = on
-- archive_command = /usr/bin/admin-mgr wal-push %p >> /var/log/wal-g/wal-push.log 2>&1
-- archive_timeout = 120
-- wal_level       = logical

select archived_count, failed_count, now()-last_archived_time from pg_stat_archiver;
-- 1590 | 0 | 00:02:24
```

**WAL-G is continuously shipping WAL to object storage, 1,590 segments since 2026-05-22, zero failures, last push 2 min ago.** The *substrate* for a point-in-time restore exists and is healthy. That is a real, measured, good fact.

What is **not** established is whether the owner can *use* it. Supabase backups doc, https://supabase.com/docs/guides/platform/backups (fetched 2026-07-28):

> **Free:** *"We recommend that free tier plan projects regularly export their data using the Supabase CLI `db dump` command and maintain off-site backups."* — no automatic backups.
> **Pro:** *"Pro Plan projects can access the last 7 days of daily backups."*
> Restore is self-serve from Dashboard → Database → Backups. On duration, the doc says only: *"Downtime depends on the size of the database—the larger it is, the longer the downtime will be."* **No published RTO number.**

### 3.2 Free vs Pro — I narrowed it but did not close it

New evidence I gathered (nobody in Workflow 1 ran this):

```
mcp__supabase__list_branches →
{"id":"88ba5e74-…","name":"main","project_ref":"hjppxawglmukfvsgmcog","is_default":true,
 "created_at":"2026-07-05T07:10:18Z","preview_project_status":"ACTIVE_HEALTHY"}
```

The call **succeeded and returned a branch record** rather than the HTTP 402 that `AGENTS.md` documents for Pro-gated branching. That tilts toward **Pro**. It is not conclusive: the record was created 2026-07-05, the same date the session memory records branching *becoming* Pro-gated, so it may be an artifact of an attempt rather than proof of entitlement. I have no SQL or MCP route to the org's billing field.

**Verdict: UNRESOLVED, tilting Pro. The 30-second check that settles it: Supabase Dashboard → Organization → Billing.**

**But here is why it matters less than Workflow 1 implied.** Both branches of the question produce a bad answer, differing only in degree:

| | If **Free** | If **Pro** |
|---|---|---|
| RPO | **Whatever the last manual `pg_dump` was.** I found no dump artifact, no schedule, no runbook step for one. Effectively **unbounded** | **≤24 h** (last daily backup) |
| Platform RTO | ∞ without a dump; with one, a logical restore into a fresh project — but §1.2 means the schema you restore *into* is unreproducible | 4–24 h (§3.3) |
| Per-tenant RTO | ∞ | ∞ |
| Extra risk | 500 MB cap + documented pause-after-inactivity | none |

**The RPO I can defend today is: ≤24 h if the org is on Pro; unknown-and-possibly-unbounded if it is on Free. The fact that a payment-handling production system's RPO is a coin-flip nobody in three audits has resolved is itself the finding.**

### 3.3 How long a restore actually takes at 3,000-gym size

Supabase publishes no number, so this is **modelled**, from measured inputs. Volume from arch-tenancy §2.1 (222M rows/yr; **276–423 GB by year 3**). Disk throughput per tier from price-compute §1 (Supabase compute-and-disk, fetched 2026-07-27).

Physical restore floor = size ÷ sequential throughput, ignoring WAL replay and instance provisioning:

| Compute tier | Baseline throughput | 300 GB restore, I/O floor |
|---|---|---|
| Micro/Small (current class) | 11–22 MB/s | **3.9 – 7.8 h** |
| Large | 79 MB/s | 1.1 h |
| XL | 149 MB/s | 34 min |

Logical restore (`pg_dump`/`pg_restore` — the **only** option if the project itself is gone: org suspension, vendor incident, or a migration that corrupted the schema) is dominated by index rebuilds: 89 indexes over 222M+ rows on ≤4 shared vCPU. Modelled at **8–24 h**, and it *presupposes a schema to restore into*, which §1.2 says does not exist as a reproducible artifact.

### 3.4 Who executes it at 3am

Measured: no on-call, no alerting, no runbook for a restore (`docs/runbooks/` contains `hitl-72-resend-live.md` and `smtp-resend.md`; no restore runbook). `git user: Vack99`, one contributor. **The answer is: the founder, from a phone, having never done it before, against a mechanism whose availability he has not confirmed.**

**Defensible RTO summary:**

| Scenario | RTO | Basis |
|---|---|---|
| Bad Vercel deploy | **~1 min** | Vercel instant rollback — **measured capability, the one good story** |
| Bad migration, caught immediately, forward-fixable | ~10 min | Assumed |
| Bad migration, needs restore | **4–24 h** | Modelled (§3.3) + unconfirmed mechanism (§3.2) |
| Project loss / vendor incident | **Unbounded** | No reproducible schema (§1.2), no verified dump |
| One tenant's data loss | **∞** | No mechanism exists (§2) |

---

## 4. THE SECURITY BLAST RADIUS

### 4.1 What `anon` actually holds — measured

```sql
select has_table_privilege('anon','public.ventas','TRUNCATE'),
       has_table_privilege('anon','public.clientes','TRUNCATE'),
       has_table_privilege('authenticated','public.ventas','TRUNCATE'),
       (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relkind='r' and has_table_privilege('anon',c.oid,'TRUNCATE')),
       (select count(*) ... where n.nspname='public' and c.relkind='r');
-- true | true | true | 29 | 29
```

`relacl` on `ventas`: `anon=arwdDxtm/postgres` — `a`=INSERT `r`=SELECT `w`=UPDATE `d`=DELETE **`D`=TRUNCATE** `x`=REFERENCES `t`=TRIGGER `m`=MAINTAIN.

**`anon` and `authenticated` hold TRUNCATE on 29 of 29 public tables.** And PostgreSQL 17 docs, https://www.postgresql.org/docs/17/ddl-rowsecurity.html (fetched 2026-07-28):

> *"Operations that apply to the whole table, such as **TRUNCATE** and **REFERENCES**, are **not subject to row security**."*

RLS is the only tenant boundary in this system, and it has a documented hole exactly at the whole-table verb — including on `gym_folio_counter`, whose deny-all posture (RLS on, 0 policies, confirmed by advisor `rls_enabled_no_policy`) protects it from SELECT/UPDATE but **not** from TRUNCATE.

**Honest severity: latent, not live.** PostgREST emits only SELECT/INSERT/UPDATE/DELETE/CALL — there is no HTTP verb that produces TRUNCATE, and I found **zero** functions using dynamic SQL reachable by anon (checked all 38 `public` functions for `EXECUTE`/`format(`: only `rls_auto_enable`, an event trigger, uses them). So this is not exploitable today. It matters because it means the *first* SQL-injection or dynamic-SQL function anyone ships escalates from "one tenant's data leaks" to "all 29 tables, all 3,000 tenants, gone, in one statement, and TRUNCATE is not MVCC-recoverable."

**This is not hypothetical for this codebase.** `supabase/migrations/20260715080000_revoke_anon_perf_rpcs.sql` exists precisely because of this class of bug, and its own comment names the root cause:

> *"On the hosted platform, `ALTER DEFAULT PRIVILEGES` grants EXECUTE on new functions to anon/authenticated/service_role as ROLE-SPECIFIC grants. The perf migrations revoked from PUBLIC and granted to authenticated — but a revoke from PUBLIC does not remove anon's direct default grant … (local Docker never had the default grant, **which is why the local/scratch denial checks couldn't see this**)."*

That migration patched **4** functions, *"found by live probe after deploy."* The 5 write RPCs the orchestrator identified were not in that probe and are still anon-EXECUTE today (I re-verified all 7 anon-executable functions live). **The systemic defect — every new function is anon-callable by default, the local/scratch test suite is structurally blind to it, and there is no guard — is unfixed.**

### 4.2 The worst thing an unauthenticated attacker can do today, and what it costs them

I traced all 7 anon-callable functions to their first authorization check.

**The 5 "write" RPCs are safely fenced.** `create_class_session`, `edit_class_session`, `cancel_class_session`, `create_recurring_schedule`, `ensure_week_materialized` all open with:
```sql
v_gym uuid := public.staff_gym();
...
if v_gym is null then raise exception 'No autorizado'; end if;
```
and `staff_gym()` is `select gym_id from gym_membership where user_id = (select auth.uid()) and role in ('owner','operator')`. For anon, `auth.uid()` is NULL → no row → immediate raise. `gym_membership_pkey` is `(user_id, gym_id)` with `user_id` leading, so the probe is an index lookup, not a scan. **Cost to attacker ≈ cost to server. This is a real exposure (unauthenticated compute) but a cheap one — I could not construct an amplification through these five.** Workflow 1 / the orchestrator brief are right that RLS still blocks the writes.

**The genuinely exploitable one is the "intentional" one.** `enviar_mensaje_contacto` is `SECURITY DEFINER`, anon-EXECUTE (advisor WARN `anon_security_definer_function_executable`), and writes `contact_message` **bypassing RLS**. Its rate limit:

```sql
c_limit  constant integer  := 5;   -- messages per IP, per gym, per window
c_window constant interval := interval '1 hour';
...
if p_ip is not null then
  select count(*) into v_recent from public.contact_message
   where gym_id = v_gym and ip = p_ip and created_at > now() - c_window;
  if v_recent >= c_limit then raise exception 'Demasiados mensajes…'; end if;
end if;
```

Two independent bypasses, both free:
1. **`p_ip` is a client-supplied parameter with `DEFAULT NULL`.** Omit it and the entire `if` block is skipped. **No limit at all.**
2. Even if supplied, it is attacker-chosen — randomize it per call.

Turnstile does not help: it is enforced in the Next server action (`apps/client/src/app/contacto/actions.ts`), while the RPC is reachable directly at `POST /rest/v1/rpc/enviar_mensaje_contacto` with the publishable key that ships in the browser bundle. **Different door, no lock.**

**What it costs to fill the shared disk for 3,000 tenants.** Row ≈ 2.3 KB (`mensaje` ≤2000 chars + `nombre` ≤80 + email + ip + uuid + timestamp, plus 3 indexes incl. `contact_message_ratelimit_idx`):

| Sustained rate | Bytes/day | Free 500 MB cap | Pro Micro 8 GB disk |
|---|---|---|---|
| 10 req/s | 2.0 GB | **~6 h** | ~4 days |
| 100 req/s | 19.9 GB | **~36 min** | ~9.6 h |

Then the disk ratchet applies: autoscale fires at 90%, adds +50%, and *"You can increase disk size but cannot decrease it"* (price-compute §2, fetched 2026-07-27). **A one-hour attack permanently raises the floor of the monthly bill, and no amount of deleting rows lowers it.** Cost to the attacker: one publicly-published API key and a laptop.

### 4.3 The tenant directory is public

```sql
select has_table_privilege('anon','public.gym','SELECT'),          -- false  (correctly revoked)
       has_table_privilege('anon','public.gym_domain','SELECT');   -- TRUE
```
`gym_domain` carries `(id, gym_id, hostname, app)` with policy `gym_domain_anon_select USING (true)`. **Any unauthenticated caller can enumerate every tenant's hostnames and gym UUIDs — the complete customer list, 3,000 rows, one request.** The `gym` table itself is properly fenced (SELECT revoked at grant level, which is why the RLS `USING(true)` on it is inert) — that revoke was good work. `gym_domain` was missed.

---

## 5. THE 5 WORST BLAST-RADIUS PROPERTIES, WORST FIRST

### 1. There is no rebuild artifact, and the only channel that can touch all 3,000 tenants has zero automated gate.
25% migration-ledger match (§1.2), migrations applied as table owner with RLS documented not to apply (§1.1), CI that never touches a database, and no staging/canary. Every other incident inherits its severity from this: if you cannot rebuild the schema, every failure mode is terminal rather than recoverable.
**Breaks at:** the first migration that is wrong in a way that isn't forward-fixable — which is a function of *shipping rate*, not gym count. It is equally likely at 4 gyms and at 3,000; only the cost differs.
**Confidence:** measured.
**Cheapest mitigation:** `supabase db dump --schema-only` committed to the repo weekly as `supabase/schema.sql`, plus one reconciliation pass to rebase the migration ledger. **Cost: $0, ~1 day of work.** Add `pnpm test:denial` against a scratch project to CI as a required check on any `supabase/migrations/**` diff: **$0** (the scratch project already exists — `gyyujeguycxxoaqgdnjp`, kept per session memory).
**Exit trigger for "keep shipping via MCP `apply_migration`":** the day the ledger match rate drops below 25% again after a reconciliation, or the first migration that requires a restore. Either reverses it — move to `supabase db push` from a reconciled ledger.

### 2. Per-tenant recovery does not exist and cannot be bought.
Physical PITR is platform-wide by construction (§2.1). The export covers 4 of 29 tables, drops all primary keys, and denormalizes FKs to display names (§2.2). The import path is 0 of 29 (§2.3). One gym's mass-UPDATE is unrecoverable without rolling back 2,999 others.
**Breaks at:** gym #1. This is already true today and gets worse only in expected cost — at 3,000 gyms with a 1%/yr incident rate that is **30 unrecoverable-data-loss events per year**.
**Confidence:** measured (code read, greps run).
**Cheapest mitigation:** a nightly `COPY (select * from <t> where gym_id = $1) TO …` loop per gym into Supabase Storage as JSONL — **29 tables, IDs intact, restorable**. At the measured 15 MB / 4 gyms, 3,000 gyms ≈ 11 GB/night compressed; Storage is ~$0.021/GB-mo. **Cost: ~$5–15/mo + ~2 days of work.** Second, cheaper half: add `deleted_at` + an `audit` table to `clientes`/`ventas` so the common case (operator error) never needs a restore at all. **Cost: $0.**
**Exit trigger for "keep shared-DB tenancy":** the first paying gym that asks for its data back and cannot get it. That single event should promote database-per-tenant or per-tenant logical export from "nice" to "required."

### 3. The backup posture is unverified, so the RPO is undefendable.
WAL archiving is measurably healthy (1,590 segments, 0 failures, 2-min lag) but whether the owner can *use* it is still unresolved after three audits (§3.2). No restore has ever been exercised. No restore runbook exists. No alerting exists to tell anyone a restore is needed (§1.6).
**Breaks at:** the first incident requiring a restore — at which point you discover the answer under maximum pressure.
**Confidence:** measured on the substrate, **asserted** on the entitlement.
**Cheapest mitigation:** (a) open Dashboard → Billing, **30 seconds, $0**; (b) if Free, upgrade to Pro for daily backups — **$25/mo, which is 1.7% of one gym's revenue at 1,500 MXN/mo**; (c) restore one backup into the existing scratch project and *time it* — **$0, half a day**, and it converts every number in §3.3 from modelled to measured.
**Exit trigger:** none needed — (a) and (c) are unconditionally worth doing. If a timed restore exceeds 4 h at *current* 15 MB size, escalate immediately: it will be 20× worse at 300 GB.

### 4. One email identity gates login for the entire platform, and it is on a 100/day free tier.
One Resend account, one domain, and one API key that is simultaneously the Supabase SMTP password and the invite/receipt sender (§1.3, quoted from the runbook). Magic link is the sole activation door. Any single tenant's dirty roster trips an account-wide rolling-window bounce suspension → **nobody on the platform can log in**, and there is no suppression list to prevent a repeat.
**Breaks at:** **~100 auth emails/day, platform-wide** — that is the Resend Free cap, reached today by onboarding half of one gym's roster. The suspension risk is per-*event*, not per-gym-count.
**Confidence:** measured (runbook text + code) for the architecture; primary-fetched (alt-email §3/§4.4) for the vendor limits.
**Cheapest mitigation, in order:** (a) split the credential — a separate API key for auth SMTP vs. invites, so a send-side suspension cannot take down login. **$0, 10 minutes.** (b) Per-tenant sending subdomains — Resend's own docs recommend it *"to isolate your sending reputation."* **$0, DNS-only.** (c) A `suppression` table consulted before every send. **$0, ~half a day.** (d) A paid tier before onboarding gym #20. Per alt-email §3, SES is 4–10× cheaper at this volume shape (**~$61–116/mo at 3,000 gyms**) than Resend's plan ladder.
**Exit trigger for "keep one shared domain":** the day any bulk-import path ships (CSV, contact paste). At that moment per-tenant subdomains become mandatory regardless of gym count.

### 5. `anon` holds TRUNCATE on 29/29 tables, and one anon-callable DEFINER write has no working rate limit.
The tenant boundary is RLS, and PostgreSQL documents that RLS does not apply to TRUNCATE (§4.1). Separately, `enviar_mensaje_contacto` lets an unauthenticated caller write unbounded rows into the shared disk because its limit keys on a client-supplied `p_ip` that defaults to NULL (§4.2). And `gym_domain` publishes the full customer list to anon (§4.3). The repo has already been bitten once by Supabase's default anon grants and patched only the 4 instances a live probe happened to find.
**Breaks at:** TRUNCATE — latent until the first dynamic-SQL function or injection, then instant and total. Disk fill — **~36 min at 100 req/s on Free, ~9.6 h on Pro Micro**, any day someone chooses to.
**Confidence:** measured (privilege bits + function bodies) and primary-sourced (PostgreSQL 17 docs, fetched 2026-07-28).
**Cheapest mitigation:** one migration, **$0, 20 minutes total**:
```sql
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate on tables from anon, authenticated;
revoke select on public.gym_domain from anon;   -- resolveTenant runs server-side; verify first
-- and: derive the IP server-side (drop p_ip from the signature, or make NULL fail closed)
```
Plus the guard the repo is missing: a `tools/guards/` test asserting **no new `public` function is anon-EXECUTE** unless allow-listed — the same shape as the existing `rpc-write-coverage` guard, which proves the pattern already works here. **Cost: $0, ~2 h.**
**Exit trigger for "keep the anon RPC surface":** any new `SECURITY DEFINER` function reaching anon, or the first `contact_message` row count anomaly. Either means the allow-list guard should have existed already.

---

## 6. What would have to be true for my "this is fine" calls to be wrong

I called four things fine. Each with the falsification I actually ran:

1. **"The 5 anon write RPCs are cheaply fenced."** Wrong if `staff_gym()` were a scan. **Checked:** `gym_membership_pkey (user_id, gym_id)` has `user_id` leading, so the NULL-uid probe is an index lookup. Wrong if one of the five did work *before* the check. **Checked:** read all five bodies; `staff_gym()` is the first statement in each. *Would reverse this:* a future RPC that does work before authorizing, or a policy change making the membership probe a scan.
2. **"A `delete from gym` cannot cascade a tenant away."** Wrong if any money-bearing child were CASCADE. **Checked all 50 FKs:** `clientes`, `ventas`, `asistencias`, `paquetes`, `perfil`, `cobro`, `plantillas`, `plan_feature` are all NO ACTION → the delete errors. *Would reverse this:* any migration flipping one of those eight to CASCADE.
3. **"TRUNCATE is not exploitable today."** Wrong if any anon-reachable path emits arbitrary SQL. **Checked all 38 `public` functions** for `EXECUTE`/`format(`: only `rls_auto_enable` (an event trigger, not API-reachable). *Would reverse this:* the first dynamic-SQL function, or PostgREST gaining a bulk verb.
4. **"The Vercel deployment is the one SPOF with a good recovery story."** Wrong if rollback were gated or slow. I did **not** verify a rollback empirically — this rests on Vercel's documented instant-rollback behaviour, not on a test in this project. Marked asserted.

---

## 7. My own blind spots

1. **I never established the Supabase plan.** I narrowed it (`list_branches` succeeded rather than 402ing → tilts Pro) but there is no SQL or MCP route to the billing field, and I would not use the owner's PAT to hit the management API. §3.2's whole table hinges on a fact I could not read. **This is the single highest-value 30-second check remaining and no agent across two workflows has done it.**
2. **I never timed a restore.** Every number in §3.3 is size ÷ published throughput. Real restores are dominated by WAL replay and provisioning, neither of which Supabase publishes. The 4–24 h band could be off by 2× in either direction. A timed restore into the existing scratch project would replace the whole section with measurement.
3. **I did not attempt any exploit.** The `enviar_mensaje_contacto` disk-fill and the `p_ip=NULL` bypass are read from the function body and are unambiguous in the source, but I never sent a request — Supabase's API gateway may impose an undocumented per-IP request cap that changes the §4.2 rate table. The bypass is certain; the *throughput* is modelled.
4. **I did not audit the Vercel side directly.** No `vercel.json` exists in the repo and I have no dashboard access, so "one deployment per app" comes from ADR-0012 and Workflow 1, not from my own observation. Whether preview deployments, env-var scoping, or the two projects' rollback histories introduce further SPOFs is unexamined.
5. **I treated the 4-gym production dataset as representative of shape, not of behaviour.** The FK-closure result (0 cross-gym rows) and the roster-collision result (0 duplicates) are true of 116 rows written mostly by one careful founder. Neither generalizes to 3,000 gyms with 3,000 untrained operators, and §1.4 shows the database does not enforce either property.
