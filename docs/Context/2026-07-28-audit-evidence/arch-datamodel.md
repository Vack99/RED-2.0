# arch:datamodel — is the RED 2.0 data model the right shape?

**Agent:** `arch:datamodel` · **Date:** 2026-07-27 · **DB:** live prod `hjppxawglmukfvsgmcog`, read-only (SELECT / EXPLAIN-no-ANALYZE / pg_catalog only).
**Subject:** `clientes` / `gym_membership` / `ventas` / `asistencias` / `reservation` at a target of ≥3,000 gyms × 150–300 members.

---

## 0. Bottom line, before the ranking

Two honest statements up front, because rule 7 outranks rule 1.

**What is genuinely well built (evidence, not politeness):**

| Property | Evidence |
|---|---|
| `gym_id` denormalised onto **every** tenant table, `NOT NULL` + FK | `list_tables` verbose dump; every one of the 25 gym-scoped tables carries it. Every RLS predicate is therefore a single-column comparison — no join in the security barrier. |
| Zero cross-tenant row corruption today | Six mismatch probes, all `0`: `ventas.gym_id≠clientes.gym_id`, `asistencias↔clientes`, `reservation↔clientes`, `reservation↔class_session`, `asistencias↔class_session`, `clientes.favorite_class_type↔class_type`. |
| `ventas` snapshot columns do **not** drift | Live proof: forge folios show `Ilimitado` at 1350 (11 sales, to 2026-07-10) and 1349 (5 sales, from 2026-07-14) while `paquetes.precio` now reads 1349. The historical terms survived a catalog edit. That is the snapshot working exactly as designed. |
| Balance replay reconciles **exactly** | Member `fb9c585b`, 4 sales. Replaying ADR-0003 stacking: 05-31+20 → 06-20; 05-31+(20+25) → 07-15; 06-01+(44+20) → 08-04; 06-15+(50+30) → **09-03**. Live `clientes.vence` = **2026-09-03**. Classes: 40 sold − 14 active-consumed = **26** = live `clases_restantes`. ADR-0002/0004 "derived, not stored" is being honoured today. |
| Per-gym folio numbering, **gap-free** | `gym_folio_counter` PK on `gym_id` + `ventas_folio_gym_uq UNIQUE (gym_id, folio)`. `next_folio` increments a **table row inside the caller's transaction**, not a sequence — so a rolled-back sale rolls back the folio and leaves no gap. Correct for Mexican receipt sequencing and better than the obvious `bigserial`. It also re-checks `is_staff_of(p_gym)` internally, and `registrar_venta` takes the lock **last**, minimising hold time. |
| Idempotency rail | `ventas_idem_gym_uq UNIQUE (gym_id, idempotency_key) WHERE idempotency_key IS NOT NULL` + the replay branch at the head of `registrar_venta`. |
| `reservation` terminal-row reuse | `UNIQUE (member_id, class_session_id)` + `reservar_clase` reuses a `cancelada`/`no_show` row instead of inserting. One row per (member, session) forever — bounded, clean. |

**Storage is not the problem and I agree with the prior audit on that.** Projection in §6: ~67 GB/yr of new rows at 3,000 gyms. Supabase Pro includes 8 GB then **$0.125/GB** ([supabase.com/pricing](https://supabase.com/pricing), fetched **2026-07-27**) → ~**$24/month** of disk overage at year 3. Against 3,000 gyms × 300–1,500 MXN/mo that is a rounding error. **The data model's cost is not measured in gigabytes. It is measured in operations the schema cannot express.**

**What is wrong is shape, not size.** Ranked below.

---

## 1. THE FIVE WORST THINGS, worst first

### #1 — The money model has no correction path, and the only correction the DB *does* permit desynchronises the ledger from the balance

**The claim:** `ventas` is de-facto append-only *by accident* (missing policies), while `clientes.clases_restantes` / `vence` — the numbers the member and the front desk actually see — are freely writable. A gym can therefore fix the *symptom* of a bad sale but never the *record*, and nothing marks that it happened.

**Evidence, all measured:**

```sql
-- 1. Which policies exist on ventas?
select tablename, policyname, cmd, roles::text from pg_policies
where schemaname='public' and tablename='ventas';
--  ventas | ventas_staff_insert | INSERT | {authenticated}
--  ventas | ventas_staff_select | SELECT | {authenticated}
-- → NO UPDATE policy. NO DELETE policy.

-- 2. Does any function update or delete ventas?
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and (prosrc ilike '%update ventas%' or prosrc ilike '%update public.ventas%'
       or prosrc ilike '%delete from public.ventas%');
-- → 0 rows.

-- 3. Are there triggers enforcing immutability?
select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal;
-- → 0.  ZERO non-internal triggers in the entire public schema.

-- 4. What can a staff user write on clientes?
select policyname, cmd, qual, with_check from pg_policies
where tablename='clientes' and cmd='UPDATE';
--  clientes_staff_update | UPDATE | is_staff_of(gym_id) | is_staff_of(gym_id)
select privilege_type, count(*) from information_schema.column_privileges
where table_name='clientes' and grantee='authenticated' group by 1;
--  UPDATE on ALL 18 columns, including clases_restantes and vence.
```

So a `PATCH /rest/v1/clientes?id=eq.X` with `{"clases_restantes": 40, "vence": "2027-01-01"}` succeeds for any operator. A `PATCH /rest/v1/ventas` does not. **The schema makes the derived projection editable and the source of truth immutable — exactly backwards.**

Reinforcing gaps in `registrar_venta` (source read live from `pg_proc.prosrc`):
- `monto := v_pk_precio` — the sale stores the **catalog list price**, never an amount tendered. There is no `descuento`, no `pagado`, no `saldo_pendiente`. A 100-peso discount forces the operator through the `personalizado` path (name 3–40 chars, re-type classes and days), which then *also* severs the sale from the catalog (see #5).
- Backdating is hard-capped: `if v_inicio < v_hoy - 30 then raise exception 'La fecha de inicio no puede tener más de 30 días de antigüedad'`. A data-entry error found on day 45 is unfixable by design.
- ADR-0004 §Consequences says "*A future reconcile job could re-derive the balance from the ledger if drift is ever suspected.*" **That job does not exist**, and §5 below shows why it can no longer be written correctly.
- No ADR in `docs/adr/` contains the words void, refund, anular, reembolso, or corrección. `grep -rn "void\|refund\|anular\|reembolso" docs/adr/` → nothing in a decision context. **This was never decided; it was never noticed.**

**Where it breaks, in numbers.** At 3,000 gyms × ~2,700 sales/gym/yr (12 renewals × 225 members) = **8.1M sales/yr**. A conservative 0.5% front-desk keying-error rate (wrong member, wrong package, wrong method) = **40,500 uncorrectable sales/yr ≈ 111/day**, every one of which escalates to the single person holding `service_role`. The first gym hits it in week one; the platform becomes unstaffable somewhere around **gym #40** (≈1.5 corrections/day, the point where one person can no longer absorb it alongside everything else).

**Migration cost now vs later:**
| | Now (175 ventas rows) | In 18 months (≈12M rows) |
|---|---|---|
| Work | 1 migration (`ventas.anulada_at`, `ventas.anula_venta_id`) + 1 `anular_venta` RPC writing a reversing row and recomputing the balance in the same txn + 1 denial suite | Same work, **plus** a forensic backfill deciding what every past direct-SQL repair meant — with no marker in the schema to find them |
| Effort | ~1 day | Unbounded; the corrections are invisible |

**Verdict: FIX. No exit trigger — this is not a "keep".**
**Falsification I ran:** *"maybe corrections are handled in the app and I missed it."* Checked: `grep -rn "\.delete()" packages apps` returns four hits, all on `about_value` / `facility` / `faq` / `stat` (CMS content). No venta or cliente delete/void anywhere in the codebase. The claim survives.

---

### #2 — 52.6% of live roster rows carry **no uniqueness key at all**, and the duplicate guard is a non-locking read

**This directly contradicts the prior audit.** `docs/Context/2026-07-27-auth-structure-scale-audit.md:36` states:

> "`clientes_auth_user_id_per_gym UNIQUE (gym_id, auth_user_id) WHERE auth_user_id IS NOT NULL` and `clientes_email_gym_uq UNIQUE (gym_id, lower(email))` make 'one identity, N tenants, at most one roster row per tenant' a database property."

**That is false for the majority of the table, because both indexes are partial.**

```sql
select
 (select count(*) from clientes where email is null) as null_email_rows,          -- 61
 (select count(*) from clientes) as total,                                        -- 116
 (select count(*) from clientes where auth_user_id is null) as unclaimed,         -- 111
 (select count(*) from clientes where email is null and auth_user_id is null)
   as rows_with_zero_unique_key;                                                  -- 61
```

- `clientes_email_gym_uq` is `WHERE email IS NOT NULL` → enforces nothing on **61/116 (52.6%)** of rows.
- `clientes_auth_user_id_per_gym` is `WHERE auth_user_id IS NOT NULL` → enforces nothing on **111/116 (95.7%)**.
- There is **no index on `tel` at all** — not unique, not even a plain btree. Full `pg_indexes` on `clientes`: `pkey`, `gym_id_idx`, `favorite_class_type_id_idx`, `claim_code_key`, `email_gym_uq`, `auth_user_id_per_gym`.

**61 rows — the CRM norm, a walk-in with a phone number and nothing else — are protected by exactly one thing:** a soft check inside `registrar_venta`:

```sql
if not p_forzar_nuevo then
  select c.id into v_dup from public.clientes c
    where c.gym_id = v_gym
      and (c.tel = p_tel or (p_email is not null and lower(c.email) = lower(p_email)))
    limit 1;
  if v_dup is not null then raise exception 'CLIENTE_DUPLICADO:%', v_dup; end if;
end if;
```

No `FOR UPDATE`. No supporting unique index. **Two concurrent front-desk terminals selling to the same walk-in both see no duplicate and both insert.** With a non-null email the `clientes_email_gym_uq` backstop catches it (and the RPC handles the `unique_violation`); with a null email — the 52.6% case — **nothing catches it**. And `p_forzar_nuevo` lets any operator bypass the check deliberately.

The downstream damage is the exact failure ADR-0009 §2 says claim-by-match exists to prevent: two rows, two independent balances, the paid classes split across them, and `mi_membresia`'s `limit 1` picking one arbitrarily.

**Where it breaks:** the **first gym with two front-desk terminals**, or one operator double-tapping COBRAR on a slow connection. At 300 members × 12 renewals/yr and a 1% duplication rate = **36 orphaned roster rows per gym per year**; at 3,000 gyms, **108,000/yr**, each carrying real money.

**Migration cost now vs later:**
| | Now (0 duplicates, measured) | Later |
|---|---|---|
| `create unique index concurrently clientes_tel_gym_uq on clientes (gym_id, tel)` | Builds instantly on 116 rows | **The build FAILS** the moment duplicates exist. You must first write a merge migration — and `ventas_cliente_id_fkey` is `ON DELETE CASCADE` (see #3), so the naive merge deletes the loser's revenue |
| Effort | ~1 hour | Days, with a money-loss failure mode |

**Verdict: ADD `UNIQUE (gym_id, tel)` NOW.**
**Exit trigger for the current "keep" (no tel uniqueness):** reverse immediately when
`select count(*) from (select gym_id, tel from clientes group by 1,2 having count(*)>1) x` **> 0**. Measured today: **0**. It is free right now and never will be again.

---

### #3 — `ventas.cliente_id ON DELETE CASCADE` makes the revenue ledger a child of a mutable roster row, and there is no archive concept at all

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid='public.ventas'::regclass and contype='f';
--  ventas_cliente_id_fkey | FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
--  ventas_gym_id_fkey     | FOREIGN KEY (gym_id) REFERENCES gym(id)
-- same story: asistencias_cliente_id_fkey ... ON DELETE CASCADE
```

**Deleting one roster row silently deletes that member's entire sales history** — and therefore retroactively changes every past monthly revenue figure, because `getResumenMes` (`packages/data/src/server/resumen.ts:41`) sums `ventas` live with no snapshot.

Two things are true simultaneously and both are bad:

**(a) The product cannot delete a member.** There is no DELETE policy on `clientes` and no delete RPC. "Borrar cliente" — table stakes in every gym product on the market — is not implementable today. And there is no soft delete either:

```sql
select count(*) from information_schema.columns
where table_schema='public' and column_name='deleted_at';   -- 1
```

**Exactly one table in the whole schema has `deleted_at`: `asistencias`.** `reservation` uses `status` + `cancelled_at`; `class_session` uses `cancelled_at`; `clientes`, `ventas`, `gym`, `coach`, `paquetes` have no lifecycle column whatsoever (`coach.is_active` and `schedule_template.is_active` are booleans with no timestamp). **Soft delete is not a pattern here — it is one table's local hack.** Consequence: the roster reader (`packages/data/src/server/clientes.ts:75-78`) is `.select(...).eq("gym_id", …).order("nombre")` — **unpaginated, unfiltered, monotonically growing forever**.

**(b) The moment someone implements deletion the obvious way, revenue evaporates.** And DELETE is only one policy away:

```sql
select table_name, grantee, string_agg(privilege_type,',' order by privilege_type)
from information_schema.role_table_grants
where table_schema='public' and table_name in ('ventas','clientes') and grantee='authenticated'
group by 1,2;
--  clientes | authenticated | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--  ventas   | authenticated | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
```

The DELETE **privilege is granted** (Supabase default). Only the *absence of an RLS policy* stops it. One `create policy clientes_staff_delete on clientes for delete using (is_staff_of(gym_id))` — a five-second, entirely reasonable-looking change — unlocks cascading destruction of the money ledger. (`TRUNCATE` is also granted to `anon` and `authenticated`, and TRUNCATE is **not** subject to RLS. It is not reachable through PostgREST today, so I rank it as latent rather than live — but it is one `SECURITY INVOKER` helper away from being reachable.)

There is no PITR on this project to recover from it: PITR is a **$100/month per 7 days retention** add-on ([supabase.com/pricing](https://supabase.com/pricing), fetched 2026-07-27).

Also unmodelled: **gym offboarding.** `clientes`, `ventas`, `asistencias`, `perfil`, `cobro`, `paquetes`, `plantillas` all FK `gym(id)` with **no** `ON DELETE` action (NO ACTION), while 20 other tables CASCADE. So `delete from gym` is blocked — good — but there is no `gym.status` / `gym.deleted_at` either. A churned gym's hosts keep resolving and its rows keep being scanned. At 3,000 gyms with even 20%/yr logo churn that is 600 zombie tenants/yr.

**Where it breaks:** the first gym that asks to remove a person — realistically **gym #3–5**. Catastrophically at whatever moment someone ships the obvious implementation.

**Migration cost now vs later:** now — `alter table ventas alter constraint ... on delete restrict` (requires drop+recreate FK; ~seconds at 175 rows) + `clientes.archived_at` + a roster filter: ~2 hours. After a cascade has fired: **unrecoverable** without PITR you don't have.

**Verdict: change to `ON DELETE RESTRICT` + add `clientes.archived_at` now.**
**Exit trigger:** reverse any decision to keep CASCADE the moment a DELETE policy is proposed on `clientes` in any diff, or when `select count(*) from pg_policies where tablename='clientes' and cmd='DELETE'` > 0.

---

### #4 — Two overlapping membership concepts, synchronised only by two RPC bodies, and neither can be revoked through the product

**The mandate's question — "is that two overlapping membership concepts?" — answers YES, confirmed live.**

`gym_membership` is **not** staff-only. It holds members too:

```sql
select gm.role, g.slug, count(*) from gym_membership gm join gym g on g.id=gm.gym_id
group by 1,2 order by 1,2;
-- member | forge-demo | 1
-- member | red-demo   | 4
-- owner  | forge / forge-demo / red / red-demo | 1 each
-- → 5 of 9 rows are role='member'.
```

So a claimed member is represented **twice**:

| Concept | Table | What it governs |
|---|---|---|
| **Authorization** | `gym_membership(user_id, gym_id, role)` | Every one of the 25 `*_member_select` RLS policies compiles to `gym_id IN (SELECT m.gym_id FROM gym_membership m WHERE m.user_id = (SELECT auth.uid()))` — verified across `class_session`, `paquetes`, `coach`, `faq`, `schedule_template`, … |
| **Roster / identity / money** | `clientes(gym_id, auth_user_id)` | Balance, PII, consent stamps; `clientes_member_select` keys on `auth_user_id = auth.uid()` — **not** on `gym_membership` |

**Nothing in the database ties them together.** No FK, no composite constraint, and — proven above — **zero triggers in `public`**. The correspondence is upheld only by both `reclamar_o_crear_cliente` and `reclamar_por_codigo` performing two writes in one transaction.

Live it holds:
```sql
select count(*) from clientes c where c.auth_user_id is not null
  and not exists (select 1 from gym_membership m where m.user_id=c.auth_user_id and m.gym_id=c.gym_id);
-- 0
```

**But divergence is silently broken in both directions:**
- `gym_membership` row without `clientes` row → a session that can read the gym's entire catalog, schedule, coaches and FAQ, but has no plan and no `mi_membresia` result.
- `clientes.auth_user_id` without `gym_membership` → the member can read **their own roster row** (`clientes_member_select`) but sees an **empty schedule** (`class_session_member_select` reads `gym_membership`). A logged-in member staring at a blank agenda with a valid balance.

Neither state raises an error anywhere. There is no check for it.

**Worse: membership cannot be revoked.**
```sql
select policyname, cmd from pg_policies where tablename='gym_membership';
--  gym_membership_self_select  | SELECT
--  gym_membership_staff_select | SELECT
```
UPDATE and DELETE privileges are granted; **no UPDATE or DELETE policy exists**, and no RPC writes `gym_membership` except the two claim functions (`insert … on conflict do nothing`). **You cannot fire a front-desk operator, demote an owner, or remove a member's access through the product.** That is a `service_role` SQL task per event. At 3,000 gyms × ~2 staff each with retail-sector turnover (~60%/yr) that is ≈**3,600 manual revocations per year** landing on one person.

**And multi-location owners are unrepresentable:**
```sql
select prosrc from pg_proc where proname='staff_gym';
--  select gym_id from public.gym_membership
--  where user_id = (select auth.uid()) and role in ('owner','operator')
--  order by gym_id limit 1;
```
`registrar_venta` derives its gym from `staff_gym()`. **An operator staffing two gyms books every sale to the lowest-UUID gym, silently.** In LatAm a 2–4-box "cadena" under one owner is a completely ordinary shape.

**Where it breaks:** the first multi-location owner (I'd expect that inside the first 30 gyms), and the first staff firing (inside the first 10).

**Migration cost now vs later:**
| | Now (9 membership rows) | Later (≈675k rows) |
|---|---|---|
| Collapse to one concept — drop `role='member'`, derive member authz from `exists(select 1 from clientes where auth_user_id=uid and gym_id=g)` | 25 policy rewrites, 9 rows to migrate. ~1 day | 25 `ACCESS EXCLUSIVE` policy swaps on hot tables, live, with 675k rows and no maintenance window |
| Or keep both + enforce the pair with a trigger | ~2 hours | Requires a reconciliation backfill first |

**Verdict: KEEP both concepts is defensible** — `gym_membership` as the sole authz source and `clientes` as the sole roster source is a clean separation and the prior audit is right that the *shape* is sound. **But it is only sound while the pair holds, and nothing enforces it.**
**Exit trigger (add as a nightly assertion):** reverse the "keep" the moment either count goes non-zero —
```sql
-- orphaned roster (measured today: 0)
select count(*) from clientes c where c.auth_user_id is not null
  and not exists (select 1 from gym_membership m where m.user_id=c.auth_user_id and m.gym_id=c.gym_id);
-- orphaned member authz (measured today: 0)
select count(*) from gym_membership m where m.role='member'
  and not exists (select 1 from clientes c where c.auth_user_id=m.user_id and c.gym_id=m.gym_id);
```
**Second exit trigger:** reverse `staff_gym()`'s `limit 1` the moment
`select count(*) from (select user_id from gym_membership where role in ('owner','operator') group by 1 having count(*)>1) x` **> 0**. Measured today: **0**.

---

### #5 — History is a replay of a rule that has **already changed once** with no version stamp, and `ventas` has no `paquete_id` — the ambiguity is **already live in a real gym**

**Sub-claim A — the temporal question is answerable today, and will stop being.**

I verified the replay works (see §0). "What did this member's membership look like on 2026-03-01?" is reconstructible from `ventas` + `asistencias` **because the stacking rule is deterministic**. But:

- The rule **changed on 2026-07-10**: `supabase/migrations/20260710121000_registrar_venta_rederive.sql`; ADR-0003 header reads *"Amended: 2026-07-10 (rulings C1 flat-30 `mes`, C4 purchase-wins, C9 vence-day-valid)"*.
- **`ventas` carries no rule-version column.** Replaying a pre-2026-07-10 sale under today's C1 flat-30 rule gives a different `vence` than the one that was actually shown to that member. The knowledge of which rule was live lives in **git history, not the database**.
- `ventas` also stores **no resulting state** — no `vence_resultante`, no `clases_resultantes`. Only the inputs.
- Any direct `UPDATE clientes SET clases_restantes = …` (permitted, see #1) is **invisible to the replay** and unmarked.

So the honest statement is: **today the ledger is replayable; the schema contains nothing that keeps it that way, and it has already survived one rule change purely by luck of low volume.**

**Sub-claim B — `ventas.paquete_nombre` is a text label, not a key, and it is already ambiguous in production.**

`ventas` has **no `paquete_id`**. The only link from a sale to the catalog is the free-text `paquete_nombre`. Live, in **forge — a real paying gym, not a demo**:

```sql
select paquete_nombre, clases, vigencia_dias, monto, count(*) n, min(fecha)::date, max(fecha)::date
from ventas where gym_id='d5f81022-…' and paquete_nombre='Ilimitado' and not personalizado
group by 1,2,3,4;
--  Ilimitado | null | 30 | 1350 | 11 | 2026-06-10 | 2026-07-10
--  Ilimitado | null | 30 | 1349 |  5 | 2026-07-14 | 2026-07-25
```

**16 sales, one label, two products.** Platform-wide, already 3 ambiguous labels across 2 gyms at only 4 gyms and 175 sales:

```sql
select count(*) from (select gym_id, paquete_nombre,
  count(distinct (clases, vigencia_tipo, vigencia_dias, monto)) d
  from ventas where not personalizado group by 1,2) x where d>1;   -- 3
```

Consequences, concretely:
- **"Revenue by plan" is already wrong** and cannot be made right retroactively.
- `packages/data/src/server/agenda-miembro.ts:545` — *"Mark the member's active plan by its unique per-gym grant label (`clientes.paquete_nombre`)"* — highlights the member's current plan by **matching text against `paquetes.nombre`**. `paquetes` has an UPDATE policy covering **all** columns, so a `PATCH` renaming a package silently un-highlights every member's plan **and permanently orphans every historical sale from its catalog row**. `actualizar_paquete` doesn't expose `nombre`, so this isn't reachable from the current UI — but it is one form field away, and it is exactly the kind of thing an onboarding gym asks for on day one.
- `clientes.paquete_nombre` is a single overwritten label — it loses the plan history entirely.

**Sub-claim C — `reservation` destroys its own cancellation history.** `reservar_clase` re-books a terminal row with `set status='reservada', cancelled_at = null, checked_at = null`. A member who books → cancels → re-books leaves **no trace of the cancellation**. No-show / late-cancel policies — a standard gym feature and a real revenue lever — cannot be built on this table without a new one.

**Where it breaks:** already broken (3 ambiguous labels live). The *painful* break is the first "which plan sells best?" question — I'd put that at gym #1 with a data-literate owner, and certainly by the first investor deck.

**Migration cost now vs later:**
| | Now (175 ventas) | Later (≈12M ventas) |
|---|---|---|
| `alter table ventas add column paquete_id uuid references paquetes(id)` + `regla_version smallint` + backfill by name | Backfill by name is unambiguous for 172/175 rows; 3 need a manual date-split. ~30 min | **The name backfill is impossible** — every renamed or reused label is permanently unresolvable |

**Verdict: add `ventas.paquete_id` (nullable, for the `personalizado` case) now.**
**Exit trigger for "keep the text snapshot only":** it has **already fired** — `ambiguous_plan_labels = 3` (threshold: > 0).

---

## 2. Invariants the app believes that the schema does **not** enforce

Every one verified against live `pg_constraint` / `pg_trigger` / `pg_policies`.

| # | The app believes | Enforced in DB? | What actually holds it up | Blast radius if it slips |
|---|---|---|---|---|
| 1 | One roster row per person per gym | **No** for 52.6% (null email) and 95.7% (null auth_user_id) | A non-locking `select … limit 1` inside `registrar_venta`, bypassable via `p_forzar_nuevo` | Split balances, orphaned money (#2) |
| 2 | A claimed `clientes` row ⟺ a `gym_membership` member row | **No** — no FK, no trigger, no constraint | Two RPC bodies each doing two inserts | Blank agenda with a valid balance, or catalog access with no plan (#4) |
| 3 | `ventas` is immutable | **No** — UPDATE/DELETE privileges granted; only the *absence of a policy* denies it | `pg_policies` having no UPDATE/DELETE row for `ventas` | One `create policy … for all` re-opens the ledger silently (#1, #3) |
| 4 | A child row's `gym_id` equals its parent's `gym_id` | **No** — no composite FK anywhere (`ventas(gym_id,cliente_id)` → `clientes(gym_id,id)` does not exist) | RPC bodies deriving `gym_id` from `staff_gym()` / the session row | Cross-tenant money attribution. Measured today: 0 violations across 6 probes |
| 5 | `clases_restantes ≥ 0` | **No** CHECK constraint | Guarded decrements (`where clases_restantes > 0`) in 3 separate RPC bodies | Negative balances. Measured today: 0 |
| 6 | `monto > 0` | **No** CHECK | `registrar_venta` bounds `p_custom_precio` 1..100000; catalog `precio` is unbounded (`paquetes.precio` has **no** CHECK) | Zero/negative revenue rows. Measured today: 0 |
| 7 | `clientes.gym_id` never changes | **No** — `clientes_staff_update` WITH CHECK only requires `is_staff_of(new.gym_id)` | Nothing | A member could be moved between two gyms the operator staffs, dragging `ventas` (whose own `gym_id` stays put) out of alignment |
| 8 | `clientes.auth_user_id` is only set by the claim RPCs | **No** — `authenticated` holds column UPDATE on `auth_user_id` under `clientes_staff_update` | Nothing | An operator can bind an arbitrary uid to a roster row, granting that person read access to it |
| 9 | `paquetes.nombre` is stable (it's the historical join key) | **No** — UPDATE policy covers all columns; `paquetes_nombre_gym_uq` only enforces uniqueness, not immutability | The UI not exposing a rename field | Permanent orphaning of sales history (#5) |
| 10 | `reservation.gym_id = class_session.gym_id` | **No** composite FK | `reservar_clase` deriving both from the session row | Cross-gym booking. Measured today: 0 |
| 11 | A gym is never deleted | **Partially** — `clientes`/`ventas`/`asistencias`/`perfil`/`cobro`/`paquetes`/`plantillas` FK with NO ACTION blocks it | The FK, genuinely | Safe. But there is also no `gym.status`, so offboarding is unmodelled |

**Item 4 is the one I'd fix alongside #2**, because it is nearly free right now: `alter table clientes add unique (gym_id, id)` then re-point `ventas_cliente_id_fkey` / `asistencias_cliente_id_fkey` / `reservation_member_id_fkey` at `(gym_id, cliente_id) → (gym_id, id)`. That turns "the RPC always stamps the right gym" from a convention into a database property, and it is the single highest-leverage constraint the schema is missing.

---

## 3. Soft delete — the mandate's question (3), answered

**It is not applied consistently. It is applied to exactly one table.**

```sql
select table_name, column_name from information_schema.columns
where table_schema='public' and column_name in ('deleted_at','archived_at','is_active','cancelled_at','status');
```

| Table | Lifecycle mechanism |
|---|---|
| `asistencias` | `deleted_at timestamptz` — **the only `deleted_at` in the schema** |
| `reservation` | `status` enum + `cancelled_at` — and `cancelled_at` is **nulled on re-book** |
| `class_session` | `cancelled_at` |
| `coach`, `schedule_template` | `is_active boolean` — no timestamp, no audit |
| `clientes`, `ventas`, `gym`, `paquetes`, `plantillas`, everything else | **nothing** |

**Do the partial indexes and RLS account for it?** For `asistencias`, yes and carefully:
- `asistencias_cliente_fecha_idx (cliente_id, fecha) WHERE deleted_at IS NULL`
- `asistencias_gym_fecha_idx (gym_id, fecha) WHERE deleted_at IS NULL`
- `asistencias_session_cliente_active_idx (class_session_id, cliente_id) WHERE deleted_at IS NULL`
- Every reader I checked filters it: `resumen.ts:46` `.is("deleted_at", null)`, `mi_membresia` `and a.deleted_at is null`, both toggle RPCs.

**But the RLS policies do not.** `asistencias_staff_select` is `gym_id IN (SELECT …)` with **no `deleted_at` clause** — soft-deleted rows are readable, which is correct for an audit trail but means *every* new reader must remember the filter. There is no view, no policy, no default that enforces it. `asistencias_gym_id_idx` (unfiltered, on `gym_id` alone) is redundant with `asistencias_gym_fecha_idx` and exists only to serve queries that forgot.

**Verdict on "keep deleted_at on `asistencias` only": KEEP is wrong** — but the fix is to *stop calling it soft delete*. It is a **reversal marker on an attendance ledger** (toggle-off refunds a class), and it should be named as such. What is genuinely missing is `clientes.archived_at`, which is a different requirement (#3).
**Exit trigger:** add `deleted_at` to a second table the moment any table other than `asistencias` needs reversible removal — and at that point extract it as a convention with a partial-index rule, not a second ad-hoc column.

---

## 4. Identity vs membership vs roster — the mandate's question (1), answered

**The separation as designed is right.** One `auth.users` per human (global), one `clientes` row per (gym, person) carrying that gym's balance and that gym's consent stamps, one `gym_membership` row per (user, gym) carrying the role. Per-gym `terms_accepted_at` / `privacy_accepted_at` is **legally correct** — each gym is a separate *responsable* under Mexico's LFPDPPP, so consent must be per-controller, not global. That is a good decision that appears to have been made deliberately.

**What breaks when one human belongs to two gyms** (live: **4 emails** hold `clientes` rows in 2+ gyms; **0** users hold claimed rows in 2+ gyms — the powder is loaded):

1. **`mi_membresia()` picks arbitrarily.**
   ```sql
   select c.id, c.gym_id, … from public.clientes c where c.auth_user_id = v_uid limit 1;
   ```
   No `gym_id` filter, no `ORDER BY`. Confirmed independently in `docs/Context/2026-07-27-multigym-rpc-scoping-decision-memo.md`. **My contribution: the schema is the enabler.** `clientes_auth_user_id_per_gym UNIQUE (gym_id, auth_user_id)` *explicitly permits* N rows per user, while the read layer assumes 1. The schema and the query layer disagree about the cardinality of the central entity.
2. **There is no "active gym" concept anywhere in the schema.** No column, no table, no session claim. So the two-gym case has no correct answer to fall back on — the schema cannot express the question.
3. **The plan lookup is a full index scan.**
   ```sql
   explain select id from clientes where auth_user_id = '…';
   -- Index Scan using clientes_auth_user_id_per_gym on clientes  (cost=0.13..3.48 rows=1)
   --   Index Cond: (auth_user_id = '…'::uuid)
   ```
   Note: **no `gym_id` condition**. PG17 has no btree skip-scan, so this scans leaf pages from the start of the index until it hits a match. This is the prior audit's C2 and it is correct — I confirm it and add the shape reason: the index exists to enforce a *constraint*, and is being used as an *access path* it was never ordered for.

**MODELLED cost at scale** (formula and inputs stated so it can be checked, not measured — I could not build a 675k-row table read-only):
- Rows in the partial index at 3,000 gyms × 225 claimed members = **675,000**.
- Index tuple ≈ 8 B header + 16 B `gym_id` uuid + 16 B `auth_user_id` uuid + 4 B line pointer ≈ **44 B** → ~185 entries/8 kB page → **≈3,650 leaf pages ≈ 30 MB**.
- Average half-scan = **≈1,825 page reads per lookup**, fired **3×** per member request (`clientes_member_select`, `reservation_member_select` subquery, `mi_membresia`).
- Warm in `shared_buffers` (224 MB — the index fits) that is single-digit ms; cold it is hundreds of ms. **The real risk is that 30 MB of hot index displaces other working sets in a 224 MB buffer pool.**
- `create index concurrently clientes_auth_user_id_idx on clientes (auth_user_id) where auth_user_id is not null` turns 1,825 page reads into ~3. **Do it now** — same argument as #2: free today, a scheduling problem at 675k.

---

## 5. Money — the mandate's question (2), answered directly

| Question | Answer | Evidence |
|---|---|---|
| Is `ventas` an immutable ledger or a mutable record? | **Neither by design.** It is a mutable record that happens to be locked by a missing RLS policy. | `pg_policies`: INSERT + SELECT only. `information_schema.role_table_grants`: UPDATE and DELETE **granted**. Zero triggers. |
| Can a sale be voided? | **No.** | No policy, no RPC, no code path (`grep .delete()` → 4 CMS hits only). |
| Corrected? | **No.** | Same. |
| Back-dated? | **Yes, but only ≤30 days.** | `registrar_venta`: `if v_inicio < v_hoy - 30 then raise`. Ledger date written as gym-tz **midday** on the backdate — a deliberate, good UTC-boundary defence. |
| Is balance derived or stored? | **Stored** (ADR-0004), and **directly writable by any operator via PostgREST**, while the ledger it should derive from is not. | `clientes_staff_update` covers all 18 columns. |
| Are there snapshot columns duplicating `paquetes`? | **Yes:** `paquete_nombre`, `clases`, `vigencia_tipo`, `vigencia_dias`, `monto`. | `list_tables` verbose. |
| Do they drift? | **No — and this is a genuine strength.** | forge `Ilimitado`: 11 sales at 1350, 5 at 1349, catalog now 1349. The old terms survived. |
| …but? | **The *label* drifts into ambiguity, and there is no `paquete_id` to disambiguate.** 3 ambiguous labels live at only 175 sales. | §1 #5. |
| Can it represent a discount / partial payment? | **No.** `monto := v_pk_precio` — the catalog list price. No `descuento`, no `pagado`, no `saldo`. | `registrar_venta` body. |

**"A money model that cannot represent a correction WILL fight the product."** It already is: the `personalizado` path (added 2026-07-11) exists precisely because the money model couldn't express "this sale is different" — and it solved it by making the sale *catalog-less* rather than by making the sale *adjustable*. That is the schema pushing the product sideways.

---

## 6. The per-gym-roster-row model at 3,000 gyms — the mandate's question (5)

**Per-gym rates measured live** (`red-demo` is the most complete tenant: 42 clientes, 96 ventas, 356 asistencias, 449 reservations, 221 sessions, 20 templates, 220 template-weeks, created 2026-07-06 → ~3 weeks of real use):

| Table | Measured rate | Per gym / yr @ 225 members | Platform / yr @ 3,000 gyms | B/row (orchestrator, incl. idx) | GB / yr |
|---|---|---|---|---|---|
| `asistencias` | 356 rows / 42 members / ~3 wk ≈ 63 /member/yr | 14,175 | **42.5M** | 558 | **23.7** |
| `reservation` | 449 / 42 / ~3 wk ≈ 80 /member/yr | 18,000 | **54.0M** | 602 | **32.5** |
| `ventas` | 12 renewals/member/yr | 2,700 | **8.1M** | 936 | **7.6** |
| `class_session` | 20 templates × 52 wk | 1,040 | **3.12M** | 613 | **1.9** |
| `schedule_template_week` | same | 1,040 | **3.12M** | ~263 | **0.8** |
| `clientes` | 225 base + ~50%/yr churn ≈ +112/yr | cumulative | **1.68M @ yr 3** | 1,483 | **2.5** (cumulative) |
| | | | | **Total** | **≈67 GB/yr** |

At year 3: ≈200 GB. Supabase disk: 8 GB included on Pro, then **$0.125/GB** → **≈$24/month**. ([supabase.com/pricing](https://supabase.com/pricing), fetched **2026-07-27**.) **The prior audit is right that cost is not the risk, and I do not contradict it.**

**The per-gym-roster-row model's real cost is not storage. It is three things the schema cannot do:**

1. **No `person` entity → no cross-gym operations.** "Transfer this member's history to the gym across town" is unrepresentable. "Which gyms does this person belong to?" requires a **full index scan** of `clientes_email_gym_uq` (leading column is `gym_id`) — and for the **52.6% with a NULL email** it is unanswerable at any cost.
2. **PII is duplicated per tenant with no way to enumerate it.** Mexico's LFPDPPP grants ARCO rights (Acceso/Rectificación/Cancelación/Oposición) with a **20-working-day response deadline** and 15 days to effect it ([LFPDPPP, diputados.gob.mx](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf) — sourced via search summary of Art. 32, **not** read verbatim from the PDF; treat the article number as ASSERTED, the 20-day figure as corroborated by two secondary sources). A cancelación request must reach every roster row for that human. Today the schema offers: a full index scan (email present), or nothing (email absent), plus `ON DELETE CASCADE` that destroys the gym's revenue when you comply. **At 3,000 gyms this is a compliance liability, not a feature gap.**
3. **`clientes` never shrinks.** No delete path, no archive column, unpaginated roster reader. At 50%/yr churn a 5-year-old gym's roster list fetches ~790 rows × 10 columns on every load — survivable, but the *product* experience of a roster half full of people who left two years ago is what actually loses the renewal.

**Verdict on the per-gym-roster-row model: KEEP.** It is the right shape — per-tenant balance, per-tenant consent, per-tenant PII, tenant-isolated by construction. The alternative (a global `person` with per-gym membership rows) would put one human's PII under 3,000 controllers' RLS and is strictly worse legally.
**Exit trigger:** reverse the moment the product needs cross-gym member identity — concretely, when `select count(*) from (select auth_user_id from clientes where auth_user_id is not null group by 1 having count(distinct gym_id)>1) x` **> 0** (measured today: **0**), or when a "which gyms am I in?" picker is specified. At that point a `person` table becomes cheaper than the workarounds.

---

## 7. Where this schema will fight the product in 18 months — ranked summary

| Rank | Fight | Fix cost now | Fix cost later | Breaks at |
|---|---|---|---|---|
| 1 | Can't void/correct a sale; balance is editable but ledger isn't | ~1 day (`anular_venta` RPC + reversing row + suite) | Unbounded — past manual repairs are unmarked and unfindable | ~gym #40 (≈1.5 corrections/day exceeds one person) |
| 2 | 52.6% of roster rows have no unique key; dup guard doesn't lock | ~1 h (`unique (gym_id, tel)`, builds instantly at 116 rows) | Index build **fails**; needs a merge migration that must dodge `ON DELETE CASCADE` | First gym with 2 terminals |
| 3 | `ventas.cliente_id ON DELETE CASCADE`; no archive concept | ~2 h (`ON DELETE RESTRICT` + `clientes.archived_at` + roster filter) | Unrecoverable after one cascade (no PITR — $100/mo add-on) | First "how do I remove this person?" (~gym #5) |
| 4 | Two membership concepts with no enforced correspondence; no revocation path; `staff_gym() limit 1` | ~1 day (collapse or add trigger) while 9 rows exist | 25 `ACCESS EXCLUSIVE` policy swaps on hot tables at 675k rows | First staff firing (~gym #10); first 2-location owner (~gym #30) |
| 5 | No `paquete_id`, no rule-version stamp; cancellation history destroyed | ~30 min (`ventas.paquete_id` + `regla_version`, backfill by name unambiguous for 172/175) | Name backfill **impossible** once any label is reused | **Already broken** — 3 ambiguous labels, 32 sales, incl. a real gym |

**One-line verdict:** the *tenancy* shape is right and I concur with the prior audit there; the *lifecycle* shape — correction, deletion, revocation, history — was never designed, and every one of the five fixes above is 10–100× cheaper this month than it will ever be again.

---

## 8. What I contradicted

1. **Prior audit line 36** — "*`clientes_auth_user_id_per_gym` and `clientes_email_gym_uq` make 'at most one roster row per tenant' a database property.*" **False for 52.6% of live rows.** Both indexes are `WHERE … IS NOT NULL`; 61/116 rows have no email, 111/116 have no `auth_user_id`, and `tel` has no index at all. The claim describes the *claimed* minority and generalises it to the table. This is the single most consequential error in that document, because it is used to justify *not* adding a constraint.
2. **Prior audit's overall "the structure is right, keep it"** — I agree on tenancy and disagree on completeness. The audit examined identity/authz and read performance; it did not examine money mutability, deletion cascades, or membership revocation, and those are where the schema fails first.
3. **ADR-0004 Consequences** — "*A future reconcile job could re-derive the balance from the ledger if drift is ever suspected.*" That job cannot now be written correctly: the stacking rule changed 2026-07-10 with no version stamp on `ventas`, and direct balance edits (permitted by `clientes_staff_update` on all columns) leave no marker.
4. **CLAUDE.md / AGENTS.md's write-coverage framing** — the `test:denial` regime proves what RPCs *write*. Nothing in it asserts what the schema *forbids*. Every finding in §2 of this report is invisible to `pnpm test:denial` because it is an absence, not a write.

---

## 9. Blind spots — what I did NOT examine

1. **`auth.users` internals and the Supabase auth schema.** I read the two FKs into it and nothing else. On auth-user deletion the pair actually stays *consistent* — `gym_membership_user_id_fkey ... ON DELETE CASCADE` drops the authz row and `clientes_auth_user_id_fkey ... ON DELETE SET NULL` unclaims the roster row, so both land on "not a member". That is correct, and I want to be explicit that I initially suspected divergence here and the FK dump proved me wrong. What I did **not** examine: email change (does `clientes.email` follow?), the `raw_user_meta_data` dependency in both claim RPCs, or whether the roster row's now-NULL `auth_user_id` leaves a re-claimable row with a cleared `claim_code` (i.e. a member who deletes their account may be permanently unable to re-activate).
2. **The 29 tables outside my five.** `class_session` / `schedule_template` / `schedule_template_week` materialisation, `gym_domain`, `gym_contact`, content tables — I sized them but did not audit their shape. `schedule_template_week` in particular is a pure bookkeeping table with no purge and 3.12M rows/yr projected.
3. **Whether the write RPCs are actually correct under concurrency** beyond reading their advisory-lock usage. I read `pg_advisory_xact_lock` calls in `toggle_pase`, `pasar_lista_sesion`, `reservar_clase` but ran no concurrency test.
4. **Query plans at scale.** Every EXPLAIN here is against 116–705 rows. All scale numbers in §4 and §6 are **MODELLED with inputs shown**, not measured. Nobody has run this schema at 1M rows.
5. **`packages/domain` rule code.** I read the SQL derivations and cross-checked one replay by hand; I did not audit `calcularResumenMes`, `derivarCliente`, `stackPaquete` or their tests.
6. **Backup/restore posture.** I noted PITR is a paid add-on and that ADR-0006 calls `respaldo` an *operational export, not disaster recovery*. I did not verify what recovery actually exists — which matters enormously given finding #3.

**Highest-value next question for whoever eats this list:** *after an `auth.users` deletion, can that person ever re-activate?* `reclamar_por_codigo` clears `claim_code` on claim (`claim_code = null`, single-use), and `clientes_auth_user_id_fkey ON DELETE SET NULL` returns the row to `auth_user_id IS NULL` with **no code left**. `preparar_invitacion` may or may not re-mint one — I did not read it. If it does not, account deletion is a one-way door for the member and a support ticket for the platform operator. **Untested.**

**Second — I raised this then checked it, and it is CLEAN, so it goes in §0 not here.** `next_folio` uses a real `update gym_folio_counter set last_folio = last_folio + 1` inside the caller's transaction, **not** a sequence. A rolled-back sale therefore rolls back the folio too: **no gaps**, which is exactly right for Mexican receipt sequencing and better than the obvious `bigserial`. It also re-checks `is_staff_of(p_gym)` internally. The only cost is that the counter row is a per-gym serialization point — but `registrar_venta` takes it **last**, after all derivation, so the lock hold is minimal. Add it to the "genuinely well built" list.
