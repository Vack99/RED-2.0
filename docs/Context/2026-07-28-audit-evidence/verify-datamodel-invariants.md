# verify:datamodel-invariants — live prod verification (2026-07-28)

Target: hjppxawglmukfvsgmcog (LIVE PROD). All queries read-only (SELECT / pg_catalog). No writes, no DDL, no `apply_migration`.

---

## (1) `ventas` has no UPDATE/DELETE policy, no void RPC, no trigger — CONFIRMED

**pg_policies for `ventas`:**
```sql
select schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check
from pg_policies where tablename = 'ventas' order by cmd;
```
```
ventas_staff_insert | INSERT | authenticated | with_check: is_staff_of(gym_id)
ventas_staff_select | SELECT | authenticated | qual: gym_id in (owner/operator memberships)
```
Only 2 policies exist. **No UPDATE policy, no DELETE policy.** Under Postgres RLS, absence of a policy for a command = deny for all non-bypassrls roles.

**pg_proc scan** for any function that updates/deletes `ventas`:
```sql
select p.proname, p.prosecdef, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
and (pg_get_functiondef(p.oid) ilike '%update%ventas%' or pg_get_functiondef(p.oid) ilike '%delete%ventas%');
```
Hits: `next_folio` (touches `gym_folio_counter`, not `ventas`), `registrar_venta` (only `insert into public.ventas ...`, never updates/deletes it), `ventas_count_por_cliente` (read-only `select`). **No function writes an UPDATE or DELETE against `ventas`.**

**pg_trigger on `ventas`:**
```sql
select tgname from pg_trigger where tgrelid='public.ventas'::regclass and not tgisinternal;
```
→ `[]`. Zero triggers.

**Verdict: CONFIRMED.** Once a `venta` row is inserted, nothing in the database — no policy, no RPC, no trigger — can ever change or remove it. There is no anular/void/refund path anywhere in the schema.

---

## (2) `clientes.clases_restantes` / `clientes.vence` are directly writable by any staff operator, all columns, no derived-vs-manual marker — CONFIRMED

**Policy `clientes_staff_update`:**
```
cmd: UPDATE | qual: is_staff_of(gym_id) | with_check: is_staff_of(gym_id)
```
No column restriction in the policy itself (RLS policies gate rows, not columns).

**Column-level grants** (`information_schema.column_privileges`, `table_name='clientes', privilege_type='UPDATE'`): every one of the 18 columns — including `clases_restantes`, `vence`, `paquete_nombre`, `email`, `tel`, `gym_id`, `auth_user_id` — is granted UPDATE to `authenticated` (and `anon`, though `anon` fails the `is_staff_of` RLS check). No PostgREST column-privilege carve-out excludes the balance fields.

There is no column on `clientes` (e.g. `balance_source`, `last_manual_edit_by`) that distinguishes a value written by `registrar_venta`'s locked derivation from one written by a raw PATCH.

**Nuance checked, not a mitigation:** `toggle_pase` (`prosecdef=false`, SECURITY INVOKER) also mutates `clases_restantes` and depends on this exact grant/policy to function — the coarse column scope is load-bearing for the invoker-RPC pattern (ADR-0005), not an accidental leftover. That explains the shape but does not close the gap: any bearer token for a staff-role `auth.users` row can `PATCH .../clientes?id=eq.X` directly via PostgREST and set `clases_restantes`/`vence` to anything, bypassing `registrar_venta`'s `for update` lock, idempotency key, XOR package validation, and every stacking rule (C1/C4/C6/C9) — with no audit trail of the bypass. Confirmed no current app code exercises this path directly (`grep` for `.from('clientes')...update(` with balance fields in `apps/` found nothing — the app always goes through RPCs), so this is a **latent boundary gap**, not a live incident: the database does not enforce it, the application's discipline currently does.

**Verdict: CONFIRMED** (as a database-enforcement gap; not observed to be exploited in current app code).

---

## (3) 61/116 (52.6%) `clientes` rows have zero uniqueness key — CONFIRMED, exact count matches

**Indexes on `clientes`:**
```
clientes_auth_user_id_per_gym  UNIQUE (gym_id, auth_user_id) WHERE auth_user_id IS NOT NULL
clientes_email_gym_uq          UNIQUE (gym_id, lower(email)) WHERE email IS NOT NULL
clientes_claim_code_key        UNIQUE (claim_code) WHERE claim_code IS NOT NULL
clientes_pkey                  UNIQUE (id)             -- surrogate, doesn't prevent duplicate people
```
No index on `tel` at all (unique or otherwise, beyond the composite btree usefulness of none).

**Count:**
```sql
select count(*) as total_clientes,
  count(*) filter (where email is not null) as with_email,
  count(*) filter (where auth_user_id is not null) as with_auth,
  count(*) filter (where email is null and auth_user_id is null) as no_unique_key
from public.clientes;
```
→ `{"total_clientes":116,"with_email":55,"with_auth":5,"no_unique_key":61}`

**61/116 = 52.6%** exactly matches the claim. These 61 rows are protected against duplication by *nothing* in the schema — `tel` has no constraint, and `registrar_venta`'s own duplicate guard (`p_forzar_nuevo`) is a plain `SELECT ... WHERE tel = p_tel OR email = p_email LIMIT 1` before the `INSERT`, i.e. a check-then-act race with no backstop index for the tel-only case (the email case at least has `clientes_email_gym_uq` as a backstop that turns a race into a caught `unique_violation`). Checked for currently-live duplicate `tel` pairs among the 61 (`group by gym_id, tel having count(*)>1`) → `[]`, so no duplicates exist *today*, but that is app-discipline, not a database guarantee.

**This directly refutes** any claim that "at most one roster row per tenant" is a database-enforced property — it is enforced only for the 55/116 with email and the 5/116 with auth_user_id (and those two sets overlap), covering at most ~59/116 (some overlap between with_email and with_auth), leaving no protection for the remainder.

**Verdict: CONFIRMED**, count exact.

---

## (4) `ventas_cliente_id_fkey` is `ON DELETE CASCADE`; DELETE is only blocked by absence-of-policy, not by design — CONFIRMED (currently dormant)

**FK definition:**
```sql
select conname, confdeltype, pg_get_constraintdef(oid)
from pg_constraint where conname='ventas_cliente_id_fkey';
```
→ `FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE`, `confdeltype = 'c'`.

**Grants:** `information_schema.role_table_grants` shows `DELETE` privilege granted at the table level on **both** `clientes` and `ventas` to `anon` and `authenticated` (this is Supabase's default blanket grant pattern — grants are broad, RLS is the actual gate).

**RLS reality check:** `clientes` currently has **no DELETE policy** (only `clientes_staff_insert` INSERT, `clientes_member_select`/`clientes_staff_select` SELECT, `clientes_staff_update` UPDATE) — so today, no `authenticated`/`anon` caller can delete a `clientes` row via PostgREST; RLS default-denies it. `service_role` and `postgres` both have `rolbypassrls=true`, so a service-role code path *could* delete right now, but repo-wide grep for `.from('clientes')...delete(` in `apps/` and `packages/` returned **zero matches** — no code path exercises this today.

**Verdict: CONFIRMED as a structural landmine, not a live bug.** The instant anyone adds a `clientes` DELETE policy (an extremely natural "delete a member" admin feature) or routes a delete through `service_role`, cascade silently destroys that member's entire `ventas` revenue history with zero warning, no trigger, no soft-delete, no archive step — this is the same table whose rows are individually un-correctable per finding (1), so the failure mode is "revenue history disappears and there is no path to reconstruct or even flag that it happened."

---

## (5) `ventas` has no `paquete_id`, no rule-version stamp — CONFIRMED

**Columns on `ventas`:** `id, cliente_id, folio, paquete_nombre, clases, vigencia_tipo, vigencia_dias, monto, metodo, fecha, created_at, gym_id, idempotency_key, personalizado`. No `paquete_id`, no `rule_version`/`stacking_version`/similar.

**Distinct `paquete_nombre` values live** (175 rows total, matches baseline):
```
8 clases                          68
12 clases                         49
Ilimitado                         24
Mensualidad ilimitada             14
Clase individual                   5
Reto 21                            4
RETO 21                            4   <- case-variant of the row above; already-live text drift
1 clase                            1
Personalizado                      1
testing renovando en Personalizado 1   <- test/debug string in the production revenue ledger
testing personalizado              1   <- test/debug string in the production revenue ledger
Promo Verano 2x1                   1
Promo 15x1                         1
Descuento Pareja                   1
```
14 distinct strings for what should be a bounded catalog; `Reto 21`/`RETO 21` is already a live case-drift duplicate, and two rows are literal test strings baked permanently into the immutable (per finding 1) revenue table.

**Verdict: CONFIRMED.** No FK to `paquetes`, so if a `paquete` is renamed or deleted, historical `ventas.paquete_nombre` silently diverges from the catalog with no link back. No rule-version stamp, so a `ventas` row from before migration `20260710121000` (the 'mes'=30-days-flat stacking ruling) and one from after are indistinguishable in the data — any future re-derivation of historical balances (e.g. an audit, a bug-driven balance rebuild) cannot tell which stacking formula applied to which row.

---

## (6) BONUS — `gym_folio_counter`: RLS enabled, zero policies — CONFIRMED, and CONFIRMED DELIBERATE

```sql
select relrowsecurity, relforcerowsecurity from pg_class where relname='gym_folio_counter';
```
→ `relrowsecurity: true, relforcerowsecurity: false`. Zero rows in `pg_policies` for this table.

**Source, `supabase/migrations/20260702231021_s5_per_gym_folio_and_rekeys.sql:29-31`:**
```sql
-- One row per gym holding the last-issued folio. RLS ON with ZERO client policies: this is not tenant data
-- a client ever reads — it is a sequence-like mechanism reachable only through next_folio() below. The PK on
-- gym_id doubles as the FK index.
```
The migration comment states the intent explicitly: this is deliberate, a sequence-like counter meant to be reachable **only** through `next_folio(uuid)`, which is `SECURITY DEFINER` and self-checks `is_staff_of(p_gym)` before touching the counter.

**Verified nothing depends on a client-side read of this table:** `grep` for `gym_folio_counter` across `apps/` → zero matches (only `packages/data/src/database.types.ts`, generated types, and migration/docs/seed files reference it). No PostgREST read of this table would silently break anything, because nothing reads it that way.

**Verdict: CONFIRMED, and the zero-policy state is DELIBERATE, not an accident.** Nothing breaks today. The only latent risk: if a future feature ever wants to *display* the next folio number to staff before committing a sale (a plausible UX ask), a developer unfamiliar with this file will hit RLS-denies-everything and may reach for the blunt fix ("add a permissive SELECT policy") rather than routing through `next_folio`/`registrar_venta` — that would still be safe (SELECT doesn't expose a write path) but defeats the "only reachable via SECURITY DEFINER" design intent documented in the comment.

---

## Ranked: 5 worst data-model invariant gaps, worst first

**1. `clientes.clases_restantes`/`vence` are raw-PATCHable by any staff bearer token, bypassing `registrar_venta` entirely — no DB-enforced distinction between a derived balance and a manual overwrite.**
This is worse than #2 below because it inverts which side of the money system is protected: the append-only ledger (`ventas`) is correctly locked down by policy, but the *derived, authoritative-for-billing* balance fields are the ones left wide open, with no audit trail of who changed them or why. It also silently defeats every correctness investment already made in `registrar_venta` (the `for update` lock, idempotency key, C1/C4/C6/C9 stacking rulings) for anyone who calls PostgREST directly instead of the RPC.
- **Cost to fix now** (116 rows, 1 admin app, 4 gyms): small — either (a) revoke column-level UPDATE on `clases_restantes`/`vence` for `authenticated` and force all balance mutation through SECURITY DEFINER RPCs, or (b) add a `BEFORE UPDATE` trigger that rejects direct writes to those two columns unless a session flag set by the RPC is present. One migration + a `test:denial` suite asserting the direct-PATCH path now fails. Half a day.
- **Cost to fix after 3,000 gyms**: same migration mechanically, but now you must first *discover* how many gyms' admin staff have been hand-editing balances outside the ledger (impossible to distinguish today — that's the bug), reconcile drift between `ventas`-derived balances and actual `clientes` values across the fleet, and risk breaking any operator workflow that has come to depend on the direct-edit escape hatch. Discovery cost, not migration cost, is what scales badly.

**2. `ventas` can never be corrected — no UPDATE, no DELETE, no void/anular RPC, no trigger.**
Every data-entry mistake (wrong `metodo`, wrong `monto`, wrong `paquete_nombre`) is permanent, and two literal test strings (`testing personalizado`, `testing renovando en Personalizado`) are already permanently embedded in the 175-row production ledger as proof this isn't hypothetical.
- **Cost to fix now**: one `anular_venta(venta_id, motivo)` SECURITY INVOKER RPC that soft-voids (an `anulada_at`/`anulada_motivo` pair, never a hard UPDATE/DELETE of the money columns) plus reverses the `clientes` balance it granted, gated by `is_staff_of` and idempotent. One migration, one denial-suite addition. A day including tests.
- **Cost after 3,000 gyms**: the same RPC, but now every gym's historical bad rows stay bad forever regardless — this fix is only ever prospective. The real cost that compounds is support/trust burden: every gym owner who makes a typo (which at 3,000 gyms × 150-300 members is a certainty, repeatedly) has no in-product fix and must be told "that's permanent," which is a much worse conversation to be having post-launch than pre-launch.

**3. 61/116 (52.6%) `clientes` rows have zero database-enforced uniqueness key.**
`registrar_venta`'s duplicate guard for the tel-only case is check-then-act with no unique-index backstop (unlike the email case, which has `clientes_email_gym_uq` to catch a race as a `unique_violation`). This is the exact mechanism already implicated in the previously-confirmed renewal-duplicate incident.
- **Cost to fix now**: add `UNIQUE (gym_id, tel) WHERE tel IS NOT NULL`. Confirmed zero live collisions today (`group by gym_id, tel having count(*)>1` → empty), so the migration is a same-day, no-conflict, no-dedup-script change.
- **Cost after 3,000 gyms**: at 150-300 members/gym with no backstop, duplicate-tel rows will exist by then (they already have historically, per the renewal-duplicate memory finding, before email backfill papered over some). Adding the constraint later means a mandatory dedup pass across the full fleet before the migration can even apply — turns a one-line `ALTER TABLE` into a data-remediation project.

**4. `ventas_cliente_id_fkey ON DELETE CASCADE` + table-level DELETE grants on `clientes`, gated only by the current *absence* of a DELETE policy.**
Currently dormant (confirmed: no DELETE policy on `clientes`, no code path anywhere in `apps/`/`packages/` deletes a `clientes` row). But it's a landmine sitting directly under the single most obvious next admin feature ("delete/remove a member") — and given finding #2 above, the destroyed history would be unrecoverable.
- **Cost to fix now**: change the FK to `ON DELETE RESTRICT` (force an explicit decision at delete time) or `ON DELETE SET NULL` if orphaned sales should be retained anonymized. One migration, zero data impact today (nothing currently deletes `clientes`).
- **Cost after 3,000 gyms**: identical migration cost, but the exposure window is every day between now and then that a "remove member" feature might ship without someone re-deriving this FK behavior from scratch — the cost isn't the fix, it's the probability of shipping the landmine live in the meantime multiplied by the number of gyms whose data would be caught in it before it's noticed.

**5. `ventas` has no `paquete_id` FK and no rule-version stamp — free-text `paquete_nombre` already shows live drift (`Reto 21`/`RETO 21`) in a 175-row ledger.**
Lowest of the five because it's a data-quality/auditability gap, not an active money-correctness or tenant-isolation hole, and the current row count is small enough that nothing has broken yet.
- **Cost to fix now**: add nullable `paquete_id uuid references paquetes(id)` (backfill-by-name best-effort for the 175 existing rows, accept some as unmapped/custom) + a `rule_version smallint not null default 2` column stamped by `registrar_venta` going forward. A day, mostly backfill-script writing.
- **Cost after 3,000 gyms**: at fleet scale (millions of `ventas` rows), the `paquete_nombre` text will have accumulated far more variants (seasonal promos renamed/deleted, typos, per-gym conventions) making any backfill-by-name pass unreliable for a large fraction of rows — the column would have to ship `NULL`-heavy, weakening any future reporting/analytics work (already flagged as a planned next-step in this repo's own history) that wants to group revenue by package.

---

## Blind spots (this verification pass)

- I did not check whether `paquetes` itself has any versioning (e.g. does editing a `paquete`'s price/vigencia in place silently change what a *future* sale of the "same" package means, compounding finding 5) — out of scope for this mandate but adjacent.
- I did not test whether a real `authenticated` JWT can actually issue the raw PATCH described in finding (2) end-to-end (I verified grants + policy text, not a live PostgREST call) — read-only mandate didn't permit executing a write to confirm empirically; the grant/policy evidence is as far as read-only verification can go.
- I did not check `auth.users`-level cascade behavior (deleting an `auth.users` row) which is a separate, unaudited blast radius from the `clientes`-row cascade covered here.
- No backup-posture check was in scope for this mandate — findings 1/2/4 above are all far worse if the Free/Pro backup question (flagged elsewhere in this workflow) resolves to Free (no point-in-time recovery).
