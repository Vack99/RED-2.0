# Issue #269 — execution brief (worktree `payment-correction`)

Prepared 2026-08-13 in a dedicated prep session. **Read this file first and only this file** — it carries
the map #265 rulings, the full recon digest, verified `path:line` anchors, and the copy-ready SQL
playbook. It exists so the execution session spends zero tokens on re-recon.

---

## 0. Where you are

| | |
|---|---|
| Worktree | `C:\Users\Aaron\Documents\Repos\RED-2.0\.claude\worktrees\payment-correction` |
| Branch | `payment-correction` |
| Base | **local** `main` @ `dd59461` (local main is 13 commits AHEAD of `origin/main` — a `fresh`/origin base would have been wrong) |
| Baseline | `pnpm lint && pnpm typecheck && pnpm test` → **green, 92 files / 1555 tests**, verified at prep time |
| Deps | `pnpm install` already run |
| Local-only files copied in | `apps/admin/.env.local`, `apps/client/.env.local`, `.mcp.json`, `docs/db-testing-throwaway-project/` (all gitignored — they do NOT come with a worktree) |

Resume with `EnterWorktree` → `path: C:/Users/Aaron/Documents/Repos/RED-2.0/.claude/worktrees/payment-correction`.

Ship rule: solo-main workflow — commit on this branch, then fast-forward `main`. **Never `git push`
without the owner explicitly asking in that conversation.** No edge functions are touched here, so
the pre-push edge guard is not in play.

---

## 1. The task

**Issue #269** — "Payment correction from the ficha: editar (monto/método) + eliminar with clawback".
Single build slice of map #265; rulings live in #266 + #267. Label `ready-for-agent`. No further
spec/ticket decomposition (owner ruling: one-session builds get one issue).

### Acceptance criteria (verbatim from #269)

1. **Migration** — `editar_venta(p_venta_id, p_monto, p_metodo)` + `eliminar_venta(p_venta_id)`:
   SECURITY INVOKER, `set search_path to ''`, EXECUTE to authenticated only; new `ventas_staff_update`
   + `ventas_staff_delete` RLS policies alongside; gym scope via `staff_gym()` and
   `where id = p_venta_id and gym_id = v_gym` (#219 pattern).
   - `eliminar_venta`: refuse past 30d from `created_at`; lock the `clientes` row FOR UPDATE; delete
     the venta; subtract its `clases` (null = subtract nothing) + its vigencia-days contribution from
     `clases_restantes`/`vence`, floor 0; revert `paquete_nombre` to most recent remaining venta
     (clear if none). One transaction.
   - `editar_venta`: updates monto + metodo only, any age, CHECK-valid metodo.
2. `pnpm gen:rpc-canon` regen committed with the migration.
3. **Denial suites asserting written rows** (wired into SUITE + `rpc-coverage.json`): edit persists
   exactly monto/metodo; delete normal clawback; the RED duplicate scenario (two sales, real
   asistencias — delete one, assert asistencias untouched + balance exact); floor case; window
   refusal; cross-tenant refusal.
4. **Data layer**: thread `venta.id` + raw `monto/metodo/fecha/clases/vigencia_*/created_at` through
   `getClienteFicha` select → `shapeFicha` → `FichaPago`; DAL `editarVenta`/`eliminarVenta`; server
   actions with typed non-throwing results; `revalidatePath` `/clientes`, `/cuenta`, `/inicio`.
5. **UI**: pago rows in HISTORIAL DE PAGOS become tappable (trailing affordance per plantillas idiom)
   → `PagoSheet` (bottom `Sheet`): full details (paquete, folio, fecha, clases, vigencia, monto,
   método); monto input + `MetodoEditor` tiles + single GUARDAR; ELIMINAR only within window, confirm
   discloses exact preview ("Se restarán X clases y Y días → quedará en Z clases, vence F. Se restarán
   $M de los ingresos de \<mes\>"); past window ELIMINAR absent, edit stays; "volver a vender" hint
   deep-linking `/vender?cliente=<id>` for wrong paquete/fecha.
6. **Docs**: amend `docs/runbooks/venta-correction.md` + the ADR append-only note in the same change
   (runbook = past-window escape hatch only).
7. **Gate**: `pnpm test` green; `pnpm test:denial` green on the scratch ref before ff to main.

---

## 2. Rulings (map #265 → #266, #267) — the product law

Product philosophy (owner, 2026-08-13): **it's the gym's data, not ours — optimize for the
administrator's agency.** Corrections are a first-class flow, not a guarded exception.

### #266 — delete model, window, edit scope, permission

1. **Delete = hard delete, warned and windowed.** Before deletion the admin sees a clear note that
   this affects the analytics/earnings shown for their business; on confirm the venta row is removed
   outright — gone from the historial and from week + month analytics alike (all earnings surfaces
   recompute from raw rows, so subtraction is automatic).
2. **Window = 30 days from registration (`created_at`), not the backdatable sold date.** Past the
   window the delete affordance simply isn't shown. No in-product recourse for older sales —
   `docs/runbooks/venta-correction.md` remains the escape hatch.
3. **Edit scope = monto + método, editable ANY TIME (no window).** Corrections fix the record at any
   age; only destruction is windowed. Wrong paquete/fecha = delete + re-sell via the backdate-capable
   VENDER flow (`/vender?cliente=<id>`).
4. **Permission = any staff** (owner + operator), symmetric with registering a sale.

### #267 — the clawback rule

Driven by the real RED duplicate-sale scenario (accidental double registration while learning
backdating, with real attendances in between).

1. `eliminar_venta`: one transaction — lock the `clientes` row FOR UPDATE → delete the `ventas` row →
   subtract that sale's `clases` and its vigencia-days contribution from `clases_restantes`/`vence`,
   floored so the balance never goes negative. Window, gym scoping and refusals enforced **inside**
   the RPC.
2. **Attendances are never touched** — structurally guaranteed: `asistencias` has no FK/link to
   `ventas`. In the duplicate scenario, deleting the extra sale leaves both real attendance rows in
   history and analytics; the balance clawback alone restores the exact as-if-never-sold state
   (16−8 granted, 2 consumed → 6 remaining).
3. **Analytics cannot mismatch by construction**: every earnings surface recomputes from raw `ventas`
   rows on read (no stored totals anywhere); attendance stats read `asistencias` only. The single
   stored derived value (balance/vence) is corrected in the same transaction.
4. **Used-classes edge**: proceed and floor at zero; the dialog discloses ("quedará en 0 clases").
   Never blocked.
5. Rule-determined details: unlimited packages (`clases` null) subtract only days; PERSONALIZADO
   follows the same rule; if the deleted sale supplied `paquete_nombre`, revert to the most recent
   remaining sale's name (clear if none); `esPrimeraCompra` self-corrects (derived from count).
6. **Confirm-dialog contract**: previews the exact outcome before anything happens — classes/days
   subtracted, resulting balance and vence, and the amount leaving that month's earnings, e.g.
   *"Se restarán 8 clases y 30 días → quedará en 6 clases, vence 8 sep. Se restarán $850 de los
   ingresos de agosto."*

### Deferred / out of scope (do not build)

- **Fecha edit-in-place** — deferred; delete + re-sell covers wrong dates.
- Folio hole + already-emailed recibo referencing a deleted sale — likely nothing needs stating.
- In-product correction of sales older than the window — runbook stays the escape hatch.

---

## 3. Open decisions the execution session must settle

### 3.1 ⚠️ HIGH — the ambient table-grant trap on `ventas` (recommendation: deviate from AC1)

No migration has ever revoked table-level DML grants on `public.ventas`. Supabase's project scaffold
runs a schema-wide `ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon, authenticated,
service_role` — recorded from a live probe in
`supabase/migrations/20260808130000_gym_legal_name_staff_update.sql:20-34`, whose header says
explicitly: *"Anyone adding the table's NEXT write policy (INSERT/DELETE) needs the same revoke-first
step — RLS default-deny is not a substitute for it once a policy for that command exists."*

So `authenticated` **already holds UPDATE/DELETE on every `ventas` column**, inert today only because
`ventas` has no UPDATE/DELETE policy. Shipping AC1 literally (`ventas_staff_update` +
`ventas_staff_delete`) activates that grant: any staff identity could then
`DELETE /rest/v1/ventas?id=eq.<x>` directly — **bypassing the 30-day window AND the clawback**,
leaving `clases_restantes`/`vence` permanently wrong. Same for `PATCH` on `folio`, `clases`, `gym_id`.

**Recommended shape (deviates from AC1's "SECURITY INVOKER + both policies"):**

- `editar_venta` — **SECURITY INVOKER** + `ventas_staff_update` policy, plus
  `revoke update on public.ventas from anon, authenticated;` then
  `grant update (monto, metodo) on public.ventas to authenticated;`. Column-level grant means the
  worst a raw PATCH can do is exactly what the RPC already permits, and the CHECK still binds.
- `eliminar_venta` — **SECURITY DEFINER**, and ship **no** `ventas_staff_delete` policy, plus
  `revoke delete on public.ventas from anon, authenticated;`. DELETE has no column granularity, so an
  INVOKER+policy design cannot be closed. Definer keeps the window + clawback the only door.
  Gate inside the body: `v_gym := public.staff_gym(); if v_gym is null then raise …` and
  `where id = p_venta_id and gym_id = v_gym` (unchanged from AC1).

State the deviation and its reason in the migration header, and append the note to the ADR alongside
the append-only amendment AC6 already requires. If you'd rather hold the line on ADR-0005's pure
INVOKER posture, that's the owner's call — but do not ship AC1 literally without the revokes.

### 3.2 The vigencia inversion is lossy — decide and document the approximation

`registrar_venta`'s stacking is path-dependent (see §5.1 for the verbatim block):

- The sale's **start date `v_inicio` is not stored on `ventas`**. Only `ventas.fecha` survives (midday
  gym-tz on `v_inicio` when backdated, else `now()`), so reconstruction needs
  `(fecha at time zone gym.timezone)::date`.
- `v_new_vence = v_inicio + (base_dias + compra_dias)` where `base_dias` was **clamped to 0** if the
  client was already expired at `v_inicio`. A plain `vence − compra_dias` is exact only when no
  clamping happened.
- The ilimitado→finite branch **discarded** the prior balance (`v_new_clases := v_pk_clases`) — that
  is genuinely irreversible from `ventas` alone.

The ruling's stated mitigation is floor-at-0 and "subtract what it granted". Implement exactly that,
and make the confirm dialog show the computed result (the ruling requires the preview anyway, so the
admin always sees the number before it lands). Note the lossy cases in the migration header.

**Vigencia contribution of one venta** (the quantity to subtract):
`case when vigencia_tipo = 'mes' then 30 else coalesce(vigencia_dias, 0) end` — flat 30 for `'mes'`
(ruling C1), `vigencia_dias` for `'dias'`, `0` if null.

---

## 4. Recon digest (from map #265, first comment — live-verified 2026-08-13)

### DB layer

- `ventas` columns: `id, cliente_id, folio, paquete_nombre, clases (null=ilimitado), vigencia_tipo
  ('dias'|'mes'), vigencia_dias, monto (integer, no >=0 CHECK), metodo, fecha (timestamptz,
  backdatable), created_at, gym_id, idempotency_key, personalizado`. UNIQUE `(gym_id, folio)`;
  partial unique `(gym_id, idempotency_key)`.
- **Zero inbound FKs into `ventas`** (live-verified via `pg_constraint`) — no cascade/orphan risk on
  delete. `asistencias` has no `venta_id`. No stored corte/earnings snapshot exists anywhere.
- **All earnings recompute from raw rows on every read** — `packages/data/src/server/resumen.ts:40-56`
  → `calcularResumenMes` (`packages/domain/src/rules.ts:241-266`), and the respaldo corte
  (`packages/data/src/server/export/rows.ts` → `calcularCorteMes`, `rules.ts:316-360`). Edit/delete
  reflects automatically on next read. Only downloaded respaldo files freeze old numbers.
- **The stored balance is the hard part**: `clientes.clases_restantes/vence/paquete_nombre` are a
  running balance (ADR-0004), written once by `registrar_venta`, never re-derivable.
- RLS on `ventas` today: `ventas_staff_select` + `ventas_staff_insert` ONLY — no UPDATE/DELETE policy
  has ever existed (deliberate).
- No RPC updates or deletes `ventas` today; `registrar_venta` is the only writer. Readers:
  `mi_membresia` (anchors membership display on the latest venta), `ventas_count_por_cliente`,
  resumen/respaldo TS queries, the ficha pagos select.
- Dedup: `registrar_venta`'s idempotency short-circuit reads by `(gym_id, idempotency_key)` — a
  deleted duplicate frees nothing that matters (fresh keys per attempt).

### UI layer

- Screen: `apps/admin/src/app/(app)/clientes/[id]/_components/cliente-detalle.tsx`.
- Idioms to mirror: `Sheet` is the sole overlay; pencil-in-AppBar → `EditarClienteSheet` → server
  action with typed non-throwing result + `revalidatePath` + `router.refresh()`; row-tap-edit +
  trailing 32×32 trash + `window.confirm` is the delete idiom; agenda `QuickGlanceSheet` →
  `EditorSheet` is the detail→edit precedent; the duplicate-guard Sheet in `vender.tsx` is the
  warning-dialog precedent (banner + stacked choice buttons).
- Earnings surfaces to revalidate after a write: `/cuenta` (RESUMEN DEL MES) and `/inicio` tiles —
  both read `getResumenMes`. Per the #184/#241 staleness pattern: `revalidatePath("/cuenta")` +
  `("/inicio")` + `("/clientes")`.
- **Horizontal swipe on the ficha is already claimed** (prev/next client) — no swipe-to-delete.

---

## 5. SQL playbook

> `supabase/functions-canonical/*.sql` holds **only the dollar-quoted body** — no `create function`,
> no header. Headers live in the migrations.

### 5.1 `registrar_venta` — the block `eliminar_venta` must invert

Commented source: `supabase/migrations/20260801120000_clientes_tel_opcional.sql:194-262`
(comment-stripped equivalent: `supabase/functions-canonical/registrar_venta.sql:124-190`). The write
it produces is at `20260801120000:264-278`. Read those lines before writing the clawback — the
stacking is `v_new_clases = base + pack`, `v_new_vence = v_inicio + (base_dias + compra_dias)`, with
`base_*` clamped to 0 when `vence` was null or already past `v_inicio`.

Header (current live signature) — `20260801120000:54-72`. Security mode is SECURITY INVOKER
**implicit** (no `security` clause; Postgres defaults to INVOKER); the repo also writes
`security invoker` explicitly in places — both are fine.

Gym gate, first two statements of the body (`functions-canonical/registrar_venta.sql:30-31`):

```sql
  v_gym := public.staff_gym();
  if v_gym is null then raise exception 'No autorizado'; end if;
```

### 5.2 The staff-side "#219 pattern" exemplar — copy this shape

`supabase/migrations/20260806120100_series_all_days_verbs.sql:223-277`
(`public.retire_recurring_schedule`) is the exact shape #269 describes: `v_gym := public.staff_gym()`
in the DECLARE → `raise 'No autorizado'` if null → mutate `where id = p_x and gym_id = v_gym` →
`if not found then raise` (**refusal, not a silent no-op**) → one transaction → `set search_path to ''`
→ revoke public+anon / grant authenticated.

> ⚠️ **Naming trap:** issue #219's own migration
> (`20260802150000_tenant_pin_mi_membresia_favorito.sql`) is the **member-side** pin — SECURITY
> DEFINER, gym as a *parameter*, `where c.auth_user_id = v_uid and c.gym_id = p_gym_id`. It states the
> principle ("identity pins, gym narrows") but its DEFINER/parameter-gym shape must **not** be copied
> into a staff RPC. Use `retire_recurring_schedule`.

### 5.3 House lockdown lines (copy verbatim, note the two-space pad on `grant`)

```sql
revoke execute on function public.editar_venta(uuid, integer, text) from public, anon;
grant  execute on function public.editar_venta(uuid, integer, text) to authenticated;
revoke execute on function public.eliminar_venta(uuid) from public, anon;
grant  execute on function public.eliminar_venta(uuid) to authenticated;
```

Rationale for revoking from **both** `public` and `anon` (a bare revoke from PUBLIC does not remove
anon's separate platform default-privilege grant): `20260808130000_gym_legal_name_staff_update.sql:104-109`.

**`set search_path` spelling splits by language:** `set search_path to ''` for **plpgsql RPCs** (use
this for both new functions — `registrar_venta` `20260801120000:71`, `retire_recurring_schedule`
`20260806120100:231`); `set search_path = ''` for `language sql` helpers (`staff_gym`, `is_staff_of`).

### 5.4 Existing `ventas` RLS policies

> ⚠️ The digest's citation `20260702173309_gym_scoped_rls_policies.sql:16` is **wrong** — the `ventas`
> policies are at **`:43-50`**.

```sql
-- 20260702173309_gym_scoped_rls_policies.sql:43-50
drop policy if exists "ventas_staff_select" on public.ventas;
create policy "ventas_staff_select" on public.ventas for select to authenticated
  using ((select public.is_staff_of(gym_id)));
drop policy if exists "ventas_staff_insert" on public.ventas;
create policy "ventas_staff_insert" on public.ventas for insert to authenticated
  with check ((select public.is_staff_of(gym_id)));
```

`ventas_staff_select` was later **superseded** by the uncorrelated-predicate rewrite
(`20260714080000_rls_uncorrelated_predicates.sql:53-56`). `ventas_staff_insert` was **not** rewritten
— `20260714080000:31-33` states the scope decision: *"SELECT policies only (the row-volume perf
surface). INSERT/UPDATE/DELETE policies keep the correlated helper form — writes touch few rows, so
there is no perf case."*

**→ any new `ventas_staff_update` must use the correlated `(select public.is_staff_of(gym_id))` form**,
matching `ventas_staff_insert`, **not** the `gym_id in (select …)` form. UPDATE-policy style
precedent: `20260702173309:38-40` (`clientes_staff_update`, `using(...) with check(...)`).

See §3.1 before adding any policy.

### 5.5 Column facts

`ventas` base table: `supabase/migrations/20260530023224_create_ventas_core.sql:48-62`. Deltas since,
in apply order: `+gym_id` NOT NULL (`20260702161613:30,237`), folio → `ventas_folio_gym_uq (gym_id,
folio)` (`20260702231021:134-147`), `user_id` **dropped** (`20260705082018:335`), `+idempotency_key`
+ partial unique (`20260710120000:11-13`), `+personalizado` (`20260711100000:12-13`), index
`(gym_id, fecha)` (`20260713180000:10-11`).

**Current `metodo` CHECK** (`20260710120000_renewal_schema_prep.sql:19-21`) — note `'pendiente'` is
**no longer legal** (ruling C2):

```sql
alter table public.ventas drop constraint if exists ventas_metodo_check;
alter table public.ventas add constraint ventas_metodo_check
  check (metodo in ('efectivo', 'transferencia', 'tarjeta'));
```

`registrar_venta` re-asserts the domain in-body (`functions-canonical/registrar_venta.sql:46-48`) so a
bad método surfaces a human message instead of a raw 23514 — **`editar_venta` should copy that raise
verbatim**:

```sql
  if p_metodo not in ('efectivo', 'transferencia', 'tarjeta') then
    raise exception 'Método inválido';
  end if;
```

`clientes` (`20260530023224:9-18`): `clases_restantes int` (**NULL = ilimitado**), `vence date`,
`paquete_nombre text` — all three unchanged since birth. ADR-0004 header at `:6-8`.

`ventas` has **no `deleted_at`** — a delete is a hard delete. Both "subtract nothing when `clases` is
null" and "floor at 0" must survive a **null `clases_restantes`**; the guard idiom is
`c.clases_restantes is not null` (`functions-canonical/cancel_class_session.sql:59`).

`public.staff_gym()` — `supabase/functions-canonical/staff_gym.sql`, declared
`returns uuid language sql stable security definer set search_path = ''`
(`20260713190200_staff_gym_deterministic.sql:8`).

### 5.6 Migration naming

Convention: `YYYYMMDDHHMMSS_snake_case_subject.sql`. Time components are hand-chosen and coarse, not
wall-clock — same-day siblings step by hour/minute blocks to encode intended apply order; ordering is
lexical filename order and that is what the guard's replay uses
(`tools/guards/denial-suite.ts:135`). Eight most recent (120 files total):

```
20260806130000_cancel_refusal_tense.sql
20260807120000_drop_unread_anon_policies.sql
20260808120000_acuerdo_aceptacion_gym_legal.sql
20260808130000_gym_legal_name_staff_update.sql
20260808140000_gym_legal_anon_read.sql
20260808150000_clientes_privacy_aviso_version.sql
20260808210000_materialization_backward_clamp.sql
20260808210100_horizon_frontier_pass_and_prune.sql
```

Next free slot: e.g. `20260813120000_editar_eliminar_venta.sql`.

---

## 6. Denial suites + guards

### 6.1 The written-rows template

`supabase/tests/registrar_venta_stamps_gym_id.sql` is the style precedent — read it in full. Skeleton:

```
header prose
begin;
do $$ … fixtures … $$;        -- synthetic gym + auth.users + gym_membership + paquetes,
                               -- ids handed forward via set_config('t.*', …, true)
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.op', true), 'role','authenticated')::text, true);
set local role authenticated;
do $$ … assertions that RAISE on mismatch … $$;
reset role;
select '<name>: OK' as result;
rollback;
```

Assert **re-selected actual columns after the call**, never the return value. Fixtures must be fully
transaction-local (zero prod UUIDs) — a live-gym lookup 22P02s on a fresh scratch project.

> ⚠️ Trap from [[venta-date-only-correction]]: `set local role authenticated` silently no-ops writes
> that need `postgres`. Inside a suite that's what you want (it proves the RLS path), but if you ever
> hand-patch data, do it as `postgres`.

### 6.2 Wiring

- **`SUITE`** — `supabase/tests/run-denial-suite.mjs:57-105`, a flat array of **single-quoted**
  basenames (47 entries). The drift guard parses source text with `/'([^']+\.sql)'/g`
  (`tools/guards/denial-suite.ts:34-38`) — **double quotes or backticks make the guard blind**.
  Slot new files near the money-path cluster at `:68-72`.
- **`QUARANTINE`** — `run-denial-suite.mjs:107-113`, currently `[]`. Landing slot for a suite that
  must not run yet, **with a stated reason**.
- **`supabase/tests/rpc-coverage.json`** — add two keys under `"coverage"`, alphabetically between
  `edit_class_session` (`:23`) and `eliminar_plantilla` (`:24`):

  ```json
      "editar_venta": { "suites": ["editar_venta_rules.sql"] },
      "eliminar_venta": { "suites": ["eliminar_venta_rules.sql"] },
  ```

  Entry type: `{ suites?: string[]; quarantined?: string }`
  (`tools/guards/rpc-write-coverage.test.ts:20`). Multi-suite shape example: `registrar_venta`
  (`rpc-coverage.json:34`).

### 6.3 What the guards actually assert (all in the ordinary `pnpm test`)

| guard | asserts |
|---|---|
| `tools/guards/rpc-write-coverage.test.ts:34-89` | every write-bearing RPC (derived by **replaying migrations**, incl. transitive writers) has a coverage key; no pure reader is listed; every named `.sql` exists **and** is in `SUITE`; **every named suite actually invokes the RPC** (regex `\b<fn>\s*\(`, comments stripped); quarantined entries state a reason |
| `tools/guards/denial-suite-drift.test.ts:20-36` | every `*.sql` in `supabase/tests/` is in `SUITE` **or** `QUARANTINE`; no phantom names; nothing in both |
| `tools/guards/rpc-canon-drift.test.ts:25-51` | every surviving RPC has a `<name>.sql` in `functions-canonical/`; no orphans; bytes equal `lf(body).trim() + "\n"` (EOL-insensitive) |

`pnpm gen:rpc-canon` = `node tools/generate-rpc-canon.mjs` (`package.json:21`); it re-derives from the
migration replay, writes one file per function, and **deletes** any canonical file not in the expected
set. **After adding the migration, run it and commit `editar_venta.sql` + `eliminar_venta.sql`, or
`pnpm test` fails.**

The guards prove a covering suite exists, is wired, and invokes the function. They **cannot** prove it
asserts written rows — that stays the human rule in `AGENTS.md`.

### 6.4 Running `test:denial` against scratch

```powershell
$env:SUPABASE_TARGET_REF='gyyujeguycxxoaqgdnjp'; $env:SUPABASE_ACCESS_TOKEN='<pat>'; pnpm test:denial
```

- Scratch ref `gyyujeguycxxoaqgdnjp` (also recorded at `20260808130000:20`). PAT lives in
  `docs/db-testing-throwaway-project/data` — already copied into this worktree. Never print it.
- The runner refuses `SUPABASE_TARGET_REF` equal to the live parent `hjppxawglmukfvsgmcog`
  (`run-denial-suite.mjs:120,169-172`).
- ⚠️ **The runner does NOT apply pending migrations on the `SUPABASE_TARGET_REF` path.**
  `targetRef ?? (await ensureBranch())` (`:174`) short-circuits — migrations are applied only as a
  side effect of *branch* creation, which is skipped. **Apply the new migration to the scratch
  project yourself first**, via
  `SUPABASE_ACCESS_TOKEN=<pat> node supabase/tests/apply-sql.mjs gyyujeguycxxoaqgdnjp supabase/migrations/<new>.sql`
  (one file per invocation), or the Supabase MCP `apply_migration` against the scratch ref.
  (`apply-sql.mjs` prints a stale `supabase/cutover/apply-sql.mjs` path in its usage string — cosmetic.)
- ⚠️ The `.mcp.json` Supabase MCP is bound to **LIVE** (`hjppxawglmukfvsgmcog`). Never let an
  `apply_migration` land there by accident.
- ⚠️ Scratch-green ≠ live-current: the scratch DB may already carry another session's DDL.
  If failures smell environmental rather than assertion FAILs, re-run once.

---

## 7. Verified TS/UI anchors (checked at `dd59461`)

### Data layer

| what | where |
|---|---|
| `getClienteFicha` | `packages/data/src/server/clientes.ts:367`; ventas leg `:413-421` |
| the ventas select (**no `id`**) | `clientes.ts:415` — `.select("fecha, created_at, paquete_nombre, monto, metodo, clases, vigencia_tipo, vigencia_dias")`; orders by `created_at desc, id desc` at `:420-421` but never selects `id` |
| `FichaPago` (display strings only) | `packages/data/src/server/derive.ts:243-248` — `{ fechaDisplay; paquete; montoDisplay; metodo }`, all `string`; consumed at `:339` |
| `shapeFicha` | `derive.ts:360`; the `pagos` construction is `:411-416` (`fmtShort(fechaEnZona(...))`, `pesos(v.monto)`, `metodoLabel(v.metodo)`); `metodoLabel` is module-private at `derive.ts:197` |
| sale write path / where `editarVenta`+`eliminarVenta` belong | `packages/data/src/server/ventas.ts` — `crearVenta` `:197+`, the `supabase.rpc("registrar_venta", …)` call `:265-292`, error mapping `:293-300`; error classes `DuplicadoError` `:147`, `EMAIL_EN_USO_MSG` `:156`, `EmailEnUsoError` `:162` |
| canonical DAL wrapper shape | `packages/data/src/server/plantillas.ts:48-55` — Zod-parse `raw` → `client ?? (await createClient())` (injectable, ADR-0001) → `await requireOperator(supabase)` → `supabase.rpc(...)` → `if (error) throw new Error("<Spanish message>")`; schemas colocated above (`:32-37`) |
| DAL-level typed non-throwing result precedent | `packages/data/src/server/asistencia.ts:284-286` (`TogglePaseOutcome` union), used at `:325` |
| earnings reads | `resumen.ts:40-48` (ventas select `"fecha, monto"`, gym-scoped, `.gte("fecha", …)`), `:75` → `calcularResumenMes` (`packages/domain/src/rules.ts:241-245`, fold `:256-266`); `calcularCorteMes` `rules.ts:316-322`, fold `:333-342`. Both are pure sums — **no rule change needed**, only fresh rows |
| `pesos()` | `packages/format/src/format.ts:16-18`, re-exported from `packages/format/src/index.ts:11` → `import { pesos } from "@gym/format"` |

### Server actions

Actions for the clientes ficha live in **`apps/admin/src/app/(app)/clientes/[id]/actions.ts`** — that
is where `editarVentaAction` / `eliminarVentaAction` belong.

House pattern (`actions.ts:1-15` + `:46-56`): the DAL throws a **named error class**, the action maps
it to `{ ok: false, mensaje }` (prod Next.js masks thrown action messages), and `revalidatePath` fires
**only on the success branch**.

```ts
"use server";

import { revalidatePath } from "next/cache";
// …
export type ActualizarClienteActionResult =
  | { ok: true; invite: EnvioResult | null }
  | { ok: false; mensaje: string };

export async function actualizarClienteAction(raw: unknown): Promise<ActualizarClienteActionResult> {
  try {
    const { invite } = await actualizarCliente(raw);
    revalidatePath("/clientes");
    revalidatePath("/inicio");
    return { ok: true, invite };
  } catch (e) {
    if (e instanceof EmailEnUsoError) return { ok: false, mensaje: e.message };
    throw e;
  }
}
```

Other precedents: `togglePaseAction` (`actions.ts:27-35`), `crearVentaAction`
(`apps/admin/src/app/(app)/vender/actions.ts:52-71`, 3-variant union `:25-28`, `revalidatePath`
`:68-69`).

### UI

| what | where |
|---|---|
| HISTORIAL DE PAGOS rows | `apps/admin/src/app/(app)/clientes/[id]/_components/cliente-detalle.tsx:474` header, `:475-477` empty state, `:478-488` `ficha.pagos.map((row, i) => …)` → plain non-interactive `<div key={i}>`. **Index keys** — row identity must be threaded from upstream |
| `Sheet` | `packages/ui/src/forge/sheet.tsx:36-46` — props `{ open, onClose, children, maxHeight = "86dvh" }`. **No `title`/`footer` slots**; headers are composed by the caller inside `children` |
| row-tap-edit + trailing 32×32 trash + `window.confirm` | `apps/admin/src/app/(app)/cuenta/_components/plantillas-sheet.tsx` — row map `:99-138`, tap-to-edit button `:105-128` (trailing `chev`), 32×32 trash `:129-136` (`forge-hit forge-pressable`, `Icon name="trash" size={15}`); the confirm idiom `borrar` is **`:48-57`** (not inside the row map) |
| warning-dialog precedent | `apps/admin/src/app/(app)/vender/_components/vender.tsx:489-537` — `<Sheet open={!!duplicado}>` `:492`, yellow-soft alert banner `:494-509`, two stacked `Button`s `:510-535` |
| `MetodoEditor` tiles | `vender.tsx:953-977` — 3-col grid, `Efectivo|Tarjeta|Transferencia` → icons `cash|card|swap`; selected = yellow border + yellow text |
| detail→edit precedent | `packages/ui/src/forge/agenda/quick-glance-sheet.tsx:78-101` (`onEdit` prop) → `.../editor-sheet.tsx:251-273`; wiring at `apps/admin/src/app/(app)/agenda/_components/agenda.tsx:622-648` and `:650-676`. Tests exist for both sheets |
| `EditarClienteSheet` | `apps/admin/src/app/(app)/clientes/[id]/_components/editar-cliente-sheet.tsx:11-26`; pencil in AppBar at `cliente-detalle.tsx:215-224`, state `:40`, import `:28`, sheet mounted `:227-237` |
| `/vender?cliente=<id>` | read in `apps/admin/src/app/(app)/vender/page.tsx:14-16`, passed as `initialClienteId` `:31`; consumed `vender.tsx:45,54` and validated at `:66` (`clientes.some(c => c.id === initialClienteId) ? initialClienteId : null`) |

### Testing the TS side

- Shared fake: `packages/data/src/server/supabase-fake.test-helper.ts` (`makeFake` `:60`) — records
  `rpcCalls: [string, unknown][]` (`:55-57`), auto-answers `auth.getClaims()` + the
  `gym_membership`/`gym` join.
- **Mirror this one**: `packages/data/src/server/ventas.test.ts` — local `makeFake(rows, { sub?,
  rpcData?, rpcError? })` `:51-128`, rpc leg `:119-127`, helper `lastRpc` `:164`; error-path tests
  `:261`, `:276`; `expect(fake.rpcCalls).toHaveLength(0)` at `:328` proves validation short-circuits
  before the write.
- Read-side RPC fixtures: `packages/data/src/server/clientes.test.ts:301-310` (`rpc?` + `rpcErrors?`).

---

## 8. Definition of done

- [ ] Migration `supabase/migrations/2026081312xxxx_*.sql` — both RPCs, grants/revokes, policies
      (see §3.1 before choosing the security shape)
- [ ] `pnpm gen:rpc-canon` run; `editar_venta.sql` + `eliminar_venta.sql` committed
- [ ] 6 assertions covered by suites in `supabase/tests/`, wired into `SUITE` + `rpc-coverage.json`
- [ ] Data layer: select → `shapeFicha` → `FichaPago` carries `id` + raw fields; DAL wrappers; server
      actions; `revalidatePath` `/clientes` + `/cuenta` + `/inicio`
- [ ] UI: tappable pago rows → `PagoSheet` with edit + windowed delete + exact-preview confirm +
      "volver a vender" hint
- [ ] `docs/runbooks/venta-correction.md` amended (past-window escape hatch only) + ADR append-only
      note
- [ ] `pnpm lint && pnpm typecheck && pnpm test` green
- [ ] Migration applied to scratch, then `pnpm test:denial` green on `gyyujeguycxxoaqgdnjp`
- [ ] Fast-forward `main`. **Do not push without the owner asking in that conversation.**
- [ ] Close #269; map #265 closes when this ships
