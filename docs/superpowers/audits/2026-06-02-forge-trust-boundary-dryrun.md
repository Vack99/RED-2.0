# Forge — Trust-Boundary Audit (dry-run, gold reference)

**Date:** 2026-06-02
**Project:** `hjppxawglmukfvsgmcog` (Supabase Postgres, single-operator gym admin)
**Method:** the `improve-database-architecture` lens applied by hand via the Supabase MCP, to validate the lens before codifying it into the skill (validate-before-codify).
**Safety:** read-only catalog inspection + `get_advisors`; every destructive probe ran inside a single self-contained `BEGIN…ROLLBACK` `execute_sql` script (operator resolved at runtime from `perfil`, mirroring `supabase/tests/toggle_pase_rules.sql`). A persistence check confirmed zero trace. **No `apply_migration`.**

The lens, applied to every rule: **"Is this rule enforced *in the database* — for every writer, across all time — or is it merely *trusted from the app*?"** Each finding is one verdict: *Rule R is enforced at layer L; it belongs at the data tier.*

---

## Validation gate (the point of this dry-run)

- **Lands on the named residual risks?** ✅ — non-negative money CHECK (F1), the RPC-is-not-the-only-write-door observation (F3), leaked-password protection (F4), unindexed FKs (F5), and the missing CI/drift gate (F6) are exactly the risks the design anticipated. (F2 was an over-claim — see its corrected note below.)
- **Re-litigates zero ADRs?** ⚠ **Corrected in Phase C.** The dry-run's **F2 re-litigated ADR-0003**: it proposed a uniqueness constraint that ADR-0003's "same-day duplicates allowed; each attendance consumes a class" explicitly forbids. The Phase-C skilled agent caught this via the skill's Phase-0 do-not-flag discipline; F2 is reframed below as a grill point, not a gap. The other findings (F1, F3–F6) re-litigate zero ADRs; F3 respects ADR-0005 (it does not demand moving math to TS), and nothing flags `clientes.clases_restantes`/`vence` (ADR-0004), `paquete_nombre`/`ventas` value-snapshots, the SQL-only attendance rules (ADR-0005), the no-ORM/RLS-primary stance (ADR-0001), or absolute-date attendance (ADR-0003); no multi-writer locking concern is raised (single-operator).
- **File-structure decision (§7.1):** no finding's best fix is a *structural remodel* (they are a CHECK, a partial-unique index, a config toggle, indexes, and CI). Therefore the skill ships **3 files** (`SKILL.md` + `BOUNDARY-LANGUAGE.md` + `MOVE-THE-BOUNDARY.md`); `REMODEL-TWICE.md` is **not** created, and its link is dropped from `SKILL.md`.

**Verdict: the lens is sound.** Proceed to codify.

---

## Findings (misplaced trust boundaries)

### F1 — Amounts can be negative · *correctness boundary in the app, not the DB*

- **Rule:** a sale's `monto` and a package's `precio` are non-negative whole MXN.
- **Current boundary:** app only (form + Zod). **Nothing at the DB.**
- **Tables/columns:** `ventas.monto`, `paquetes.precio` (both `integer`).
- **Evidence:** the CHECK inventory holds only `tel`, `metodo`, and the two `vigencia` rules — no sign constraint on either money column. Guarded probe inserted `precio = -100` cleanly: *"GAP: negative precio -100 inserted with no CHECK."*
- **Proposed boundary move:** `ALTER TABLE … ADD CONSTRAINT … CHECK (monto >= 0) NOT VALID;` then `VALIDATE CONSTRAINT …` (live data already conforms — 0 violators — so validation is non-blocking). Same for `precio`.
- **Watching test:** pgTAP `throws_ok` on a negative-amount insert; the constraint appears in the CHECK inventory as `convalidated = true`.
- **ADR note:** clean gap. Integer-MXN is locked, but a non-negative CHECK is *not* a currency/decimal-type redesign — it is in-scope.

### F2 — *(corrected in Phase C)* At-most-one-active attendance per `(cliente_id, fecha)` is **an ADR-0003 grill point, not a clean gap**

- **What the dry-run first claimed:** that `asistencias` should have at most one active (`deleted_at IS NULL`) row per `(cliente_id, fecha)`, that the existing `asistencias_cliente_fecha_idx` being **non-unique** was a clean enforcement gap, and that a guarded probe inserting two active rows (*"GAP: 2 active asistencias…"*) proved it.
- **Why that was an over-claim:** **ADR-0003 explicitly permits same-day duplicate attendances** — *"Same-day duplicates (Q6): allowed; each attendance consumes a class"*, stored as *"one row per attendance."* A partial-unique on `(cliente_id, fecha) WHERE deleted_at IS NULL` would forbid a state the ADR sanctions, so proposing it **re-litigates ADR-0003**. The two-active-rows probe demonstrated *allowed* behavior, not a gap.
- **The honest finding:** a *tension* worth grilling, not a gap to close. `toggle_pase` maintains at most one active row per day **procedurally** (`select … order by created_at desc limit 1`), yet ADR-0003 allows multiple same-day attendances. The grill question before any constraint: does the domain permit two *simultaneously active* attendances for one `(cliente, fecha)`? If yes (the ADR's reading), **no constraint is appropriate**; if the toggle's one-active invariant is the real intent, that needs an ADR-0003 amendment first. **Do not propose a unique index without resolving this against ADR-0003.**
- **How it was caught:** the Phase-C skilled agent, following the skill's Phase-0 *do-not-flag* discipline, read ADR-0003 and declined to flag this — surfacing that the orchestrator's hand-audit had over-claimed. The skill's ADR discipline was more correct than the hand pass; this correction is the validate-before-codify loop working as intended.

### F3 — The atomic RPC is not the only write door to `saldo` · *atomicity convention in the app, not the DB* (ADR-0005-adjacent, defense-in-depth)

- **Rule:** `clientes.clases_restantes`/`vence` (the saldo) and `asistencias` rows are mutated only inside the atomic money-path RPCs (`registrar_venta`, `toggle_pase`).
- **Current boundary:** convention. `clientes` and `asistencias` also carry **direct** `INSERT`/`UPDATE` RLS policies, so an authenticated writer *could* mutate the saldo or insert attendance outside the atomic transaction.
- **Evidence:** policy inventory shows `clientes_update_own` / `asistencias_insert_own` / `asistencias_update_own` (all correctly `WITH CHECK`ed to the tenant — so this is **not** an IDOR; it is an *atomicity* surface).
- **Proposed boundary move:** none forced. ADR-0005 locks the thin RPC seam, and the app legitimately needs direct `clientes` `UPDATE` for non-saldo fields (`nombre`/`tel`/`email`). The honest finding is *"the RPC is the intended saldo door, but not the only one; under single-operator this is accepted."* **Offer to record it as an ADR** so future audits stop re-surfacing it, rather than flagging it as a defect.
- **ADR note:** must **not** demand the attendance math move to TS, nor flag the SQL/TS split — ADR-0005 settles both.

---

## Advisor floor (machine-checked, diagnostic #9)

### F4 — Leaked-password protection disabled · *security advisor*

- `get_advisors(security)` returns one finding: `auth_leaked_password_protection` (WARN). HaveIBeenPwned checking is off.
- **Boundary:** nowhere. It is an **Auth config** setting, *outside* the version-controlled schema, so no migration fixes it.
- **Move:** enable it in Supabase Auth settings. **Watching test:** `get_advisors(security)` empty.

### F5 — Three unindexed foreign keys · *performance advisor (edge of the lens — reported honestly, not dressed up)*

- `get_advisors(performance)`: `clientes.user_id`, `ventas.user_id`, `ventas.cliente_id` lack covering indexes (confirmed against the index inventory).
- **Classification:** these are **performance-class** findings (the access-path lens's territory, out of scope for the trust-boundary lens per design §13) surfaced because the shared advisor floor includes `unindexed_foreign_keys`. They are reported as floor items, **not** re-cast as trust boundaries. The `user_id` FKs back every RLS predicate, so they are the ones worth an index; under single-operator with tiny tables the present impact is ~nil.
- **Move:** `CREATE INDEX CONCURRENTLY` on each FK column. **Watching test:** `get_advisors(performance)` empty.

---

## Change-safety / operability

### F6 — No automated drift or test gate · *the largest residual risk*

- **Rule:** schema regressions and type drift are caught before reaching prod.
- **Current boundary:** nowhere. `rls_cross_tenant_denial.sql` and `toggle_pase_rules.sql` are run **manually** via the MCP; there is no `supabase test db`/pgTAP wiring, no `.github/` CI, and no regenerate-and-diff gate for `database.types.ts` (a frozen snapshot that can silently desync from the migrations).
- **Proposed boundary move:** a CI job that (1) replays `supabase/migrations/` into a shadow DB, (2) runs the SQL tests, (3) runs `get_advisors`, and (4) regenerates `database.types.ts` and diffs it against the committed snapshot (`db diff` / `pg_dump` empty = no drift).
- **Watching test:** the CI job itself; a non-empty types diff fails the build.

### F7 — Cross-tenant test is environment-coupled · *minor*

- `rls_cross_tenant_denial.sql` hardcodes a live client uuid (`fb9c585b-…`); `toggle_pase_rules.sql` resolves the operator at runtime (the better pattern). Port the former to runtime resolution so it is not env-locked.

---

## Passing boundaries (what holds — an audit reports both)

- **Tenant isolation is correct end-to-end.** Every table RLS-enabled and owner-scoped; every `INSERT`/`UPDATE` policy carries `WITH CHECK = (select auth.uid()) = user_id`. The write-side IDOR probe was **rejected by the engine** (`42501: new row violates row-level security policy`) — re-homing a row to another tenant is impossible.
- **Function hygiene is correct.** `rls_auto_enable` is the only `SECURITY DEFINER` object (search_path pinned to `pg_catalog`, EXECUTE only postgres/service_role). `registrar_venta`/`toggle_pase` are `SECURITY INVOKER`, `search_path=''`, EXECUTE granted to `authenticated` only (anon excluded — the revoke held).
- **Input domains are constrained at the DB.** `tel` (10 digits), `metodo`, `vigencia_tipo`, and the `mes ⇔ vigencia_dias` coupling are all CHECK-enforced and `convalidated` (no `NOT VALID` lurking).
- **`ventas` is append-only** (SELECT + INSERT policies only; no UPDATE/DELETE).
- **Cross-tenant denial is already exercised** by a committed self-asserting test.

---

## Appendix — the guarded probe pattern (reproducible)

Every destructive probe used this envelope (operator resolved at runtime; nothing persists):

```sql
begin;
select set_config('app.op', (select user_id::text from public.perfil order by created_at limit 1), true);
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('app.op',true), 'role','authenticated')::text, true);
set local role authenticated;
--  … the violating INSERT/UPDATE, with RETURNING to observe the outcome …
rollback;
```

Persistence check after all probes: `neg_precio = 0`, `probe_pkg_persisted = 0`, `rehomed_clientes = 0`.
