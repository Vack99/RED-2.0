# Respaldo mensual — design

**Date:** 2026-07-13
**Status:** approved by owner, ready for planning
**Findings:** `docs/FIndings/2026-07-13-respaldo-mensual-base-defects.md` (9 Opus agents, all gate-passed)

The owner asked for one thing: *make the Excel backup month-scoped, with sales totals per month, because
the point of the file is to review the gym's month.* Auditing the base it would stand on turned up three
release-blockers that have nothing to do with months. **Those get fixed first.** The feature rides on top.

---

## Part 1 — Fix the base

### 1.1 Scope every staff read to the gym (P0 — closes a leak AND a scaling wall)

**One change, two independent audits demanded it.**

`getRespaldoData` reads `clientes`, `ventas`, `asistencias`, `paquetes` with **no `gym_id` filter**, trusting
RLS alone. Two things fall out of that:

- **Leak.** `paquetes`'s only `authenticated` SELECT policy is `paquetes_member_select` →
  `is_member_of(gym_id)`, not `is_staff_of`. `is_member_of` is true for **any** gym you hold **any**
  membership in. Combined with §1.5, a competitor's price catalog lands in your backup file.
- **Scaling wall.** `(select is_staff_of(ventas.gym_id))` **references the row's own column** → it is a
  **correlated SubPlan**, evaluated **once per row of the whole cross-tenant table**, and the planner
  cannot make it an index condition. Live proof: `gym_membership` (6 rows) has **214,861 seq scans**;
  `ventas` has 61 index scans against 1,574 seq scans. At `statement_timeout = 8s` ÷ 18.7µs/call the
  ceiling is **~428k rows scanned platform-wide per query** → **breaks at 10–40 gyms**, shared-fate (a
  brand-new gym gets a 500 because the scan is everyone's).

**Fix:** `.eq("gym_id", gym.id)` on every staff read. `gym.id` is **already returned** by `getOperatorGym`
and currently discarded (`respaldo.ts:115` destructures only `{ timezone: tz }`). Proven live: this flips
`Seq Scan` → `Index Cond: gym_id = …` and collapses the RLS calls from 41 to 3.

Files: `respaldo.ts:118-129`, `clientes.ts:62/91/145/194`, `asistencia.ts:56/161`, `paquetes.ts:38/82`.

**This does not violate ADR-0001.** The `.eq` is **not a boundary — it is a scope selector.** RLS answers
*"may I see this row?"* and remains the boundary; if the `.eq` were ever wrong, RLS still denies. The export
additionally needs *"which of the rows I may see belong to the gym whose name I am stamping on this file?"* —
which RLS **structurally cannot** answer, because its predicate is per-row-per-gym, not "the caller's gym."

### 1.2 Correct ADR-0013 (P0 — doc-only, and load-bearing)

ADR-0013 §2 asserts the helper *"evaluates once per statement, not once per row… O(1)-per-statement at
all-Mexico scale"* and §3 says *"**never unwrap** `(select helper(gym_id))`."* **Both are false** — it is
already per-row. Uncorrected, the next reviewer deletes §1.1 as "redundant."

### 1.3 Deterministic gym resolution (P0)

`getOperatorGym` (`gym.ts:46-51`) picks with `.limit(1)` and **no `ORDER BY`** → nondeterministic under
multi-membership. If it lands on a `member` row, the real operator is **locked out of their own admin app**.
Add `.in("role", ["owner","operator"])` + `.order("gym_id")`, and return `slug` alongside `timezone` (same
query, no extra round trip — `slug` is needed by §2.4).

`staff_gym()` (SQL) has the identical bug and `registrar_venta` uses it to stamp `gym_id` on **money rows** —
add `order by gym_id` to its body.

### 1.4 Stable pagination (P0)

`readAllAsistencias` pages by OFFSET ordered on `fecha` (a `date`) with **no unique tiebreaker**; live already
has 15 rows sharing one date. Past 1,000 rows, ties reorder across page boundaries → **rows silently
duplicated and dropped**, oldest-first. The file's own comment promises the opposite. Add `.order("id")` /
`.order("folio")` as tiebreakers.

### 1.5 Close the membership hole (P0 — migration)

`reclamar_o_crear_cliente(p_gym_id uuid)` is `SECURITY DEFINER`, `EXECUTE` granted to `authenticated`, and
inserts `gym_membership (v_uid, p_gym_id, 'member')` for a **caller-supplied** gym id. Any authenticated user
can mint themselves a membership in **any** gym (ids are free — see §1.6). **Bind `p_gym_id` to the resolved
tenant.** Migration → takes the `pnpm test:denial` scratch gate, with written-row assertions.

### 1.6 Narrow the anon surface (P0 — migration)

`gym_anon_select USING (true)` exposes the whole `gym` table — including `legal_name` and `owner_user_id` — to
anyone with the publishable key. Keep the policy (the pre-auth host→brand lookup genuinely needs an anon read)
and narrow with **column GRANTs**, which compose with RLS:

```sql
revoke select on public.gym from anon;
grant select (id, slug, brand_name, timezone, brand_module_id, token_overrides,
              about_story, about_pull_quote, about_tagline) on public.gym to anon;
```

`gym.id` stays enumerable — the brand seam needs it, and once §1.1 lands it can no longer reach the export.

### 1.7 Two-pass `instanteEnZona` (P0 — fixes a LIVE bug in the Agenda)

`fecha.ts:128` samples the tz offset at the **guessed** instant, not the true one → wrong whenever a DST
transition falls in that window. Verified against real ICU across 30 LatAm zones × 16 years:

| Broken today | Impact |
|---|---|
| `America/Santiago` | day bound off by −1h **every April**, 16/16 years |
| `America/Tijuana`, `America/Ciudad_Juarez` | **the Agenda WRITE path, twice a year, live** — a 06:00 class on the DST Sunday is created at 07:00 (`agenda.ts:373`, `:457`) |
| `rules.ts:427` (`materializarSesion`) | duplicate one-pass copy; its comment *"class hours never straddle a DST transition"* is **false** |

Fix: re-derive the offset at the candidate instant; on a gap keep the transition instant, on an overlap keep
the earlier. **6 lines. Verified 0 regressions** (30 zones × 16 years × 365 day-starts, 20,805 Agenda hours,
plus a UTC-positive control). Month bounds pass today only by coincidence — no LatAm transition has landed on
a 1st — and Chile can revoke that coincidence **by decree**.

`fecha.test.ts` currently contains **zero DST zones**; every existing test passes against a helper that
ignores DST entirely.

### 1.8 Window ventas on instants, not day strings (P0)

`resumen.ts:31` compares `ventas.fecha` (a **timestamptz**) to a bare `'YYYY-MM-DD'`, which Postgres coerces at
**UTC** midnight. Today it is harmless — it is a *lower bound only*, and for a UTC-negative zone that
over-fetches a superset which `calcularResumenMes` then re-buckets correctly on `fechaEnZona` dates. **The
dashboard card is correct today; this fix changes no number the owner sees.**

It detonates the moment an **upper** bound is added — which `?mes=` requires. `.lt("fecha", "2026-08-01")` =
`2026-07-31 18:00` local → **chops the last 6 hours of the month.** Live: **32% of all ventas** are evening
sales (55% at forge) sitting in exactly that band.

Fix: `instanteEnZona(desde, "00:00", tz).toISOString()` for **ventas**. **Leave the `asistencias` bound as a
bare day string** — that column is a `date` and an instant bound would *break* it. The two differently-typed
bounds sit side by side in one `Promise.all`; **the asymmetry is the fix, and it gets the comment.**

**`clientes.ts:154` and `:253` are NOT touched.** Both filter `asistencias` (a `date`) and are already correct.

### 1.9 Indexes (P0 — migration, index-only)

```sql
create index ventas_gym_fecha_idx      on public.ventas      (gym_id, fecha);
create index asistencias_gym_fecha_idx on public.asistencias (gym_id, fecha) where deleted_at is null;
```

Turns the month window into O(month) instead of O(gym lifetime), kills the sort (backward index scan), and
makes the month-list query O(1). **Build now, while the tables are 41 / 268 rows** — deferring means creating
them on a 650M-row table during an incident. Index-only → changes no RPC's written rows → **no new denial
assertions, one green scratch run.**

---

## Part 2 — The feature

### 2.1 Route contract

| Request | Result |
|---|---|
| `GET /cuenta/respaldo?mes=2026-07` | The month workbook (§2.2). |
| `GET /cuenta/respaldo` | **Últimos 24 meses** — the capped default (§2.5). |
| `?mes=` malformed | **400.** Validate `^\d{4}-(0[1-9]|1[0-2])$` **before** the value reaches a query or the filename. |
| Not staff | **403** (today `getOperatorGym`'s throw escapes as a 500). |

The route takes **no gym identifier** — the gym is derived from `auth.uid()` → `gym_membership`. **AC: `?mes=`
must not introduce a `gym`/`gymId`/`slug` param.**

### 2.2 The month workbook — 5 sheets

1. **Resumen** (first tab) — 3 columns, `Concepto | Monto | Cantidad`, so the peso format lands only on money
   and counts stay plain integers. Ingresos, ventas, ticket promedio, **desglose por método (3 buckets)**,
   altas del mes, asistencias del mes, then a prior-month block. Header carries the month:
   `RESUMEN — JULIO 2026 (parcial al 13 jul)`.
2. **Ventas** — today's 7 columns, month-scoped, ending in a blank row then a **bold TOTAL row**: label in
   col A, `18 ventas` in the Paquete col, the sum in the **Monto** col so it sits under the numbers it totals.
3. **Asistencias** — today's 3 columns, month-scoped.
4. **Altas** — today's 10 Clientes columns, filtered to clients whose `created_at` falls in the month.
   `Estado` / `Clases restantes` / `Urgencia` are **today's** values — there is no history table and they
   cannot be reconstructed. **The sheet header says so**, or the operator reads them as history.
5. **Paquetes** — full catálogo, unwindowed (a price list, not a ledger).

`RespaldoSheet` gains one optional `boldRows` field. The workbook assembler stays dumb.

**Which reads are windowed — and which must NOT be:**

| Read | `?mes=` | default (24m) | why |
|---|---|---|---|
| `ventas` | **windowed** — half-open **instant** bounds | windowed | the ledger being reported |
| `asistencias` | **windowed** — half-open **day** bounds (it's a `date`) | windowed | the ledger being reported |
| `clientes` | **NOT windowed — full roster** | full roster | **load-bearing:** the roster is what denormalizes `cliente_id → nombre` on the Ventas and Asistencias sheets. Window this query and every client who joined before the month renders as `—` on their own sales. The **Altas** sheet filters `created_at` **in the pure shaper**, not in the query. |
| `paquetes` | NOT windowed — full catálogo | full catálogo | a price list, not a ledger |

All four carry `.eq("gym_id", gym.id)` (§1.1).

**`metodo = 'pendiente'` does not exist.** `20260710120000_renewal_schema_prep.sql` re-added
`check (metodo in ('efectivo','transferencia','tarjeta'))` with no `NOT VALID`. Verified live. A "Por pagar"
line would be **provably always $0** — a dead legend entry a future chart would inherit. **3 buckets.**
Card-vs-export agreement is therefore automatic: both sum all ventas, and there is nothing to exclude.

### 2.3 The math — and where it lives

**The pure fold goes in `packages/domain/src/rules.ts`, types in `packages/domain/src/types.ts`.** This is
**machine-enforced, not taste**: `.dependency-cruiser.cjs` blocks `@gym/ui ✗→ @gym/data`, so if the fold's
output type were declared in the spreadsheet module, **a future chart component could not name it in its
props.** Same line count either way. One is reusable; the other is a rewrite.

```
calcularCorteMes(ventas: VentaMes[], asistencias: AsistenciaResumen[], altas: AltaMes[], mes: Date): CorteMes
```

- Takes **already-fetched rows + a month anchor**. Fetches nothing, reads no clock — mirrors
  `calcularResumenMes` (`rules.ts:229`). Buckets internally via the existing private `mismoMes` (`rules.ts:201`).
- **This shape is what defuses the N+1 for the future analytics page**: a 12-month trend adds **one** windowed
  reader and calls the fold 12× over the in-memory set. An addition, not a rewrite.
- New types `VentaMes { fecha, monto, metodo }` and `AltaMes { fecha }`; **reuse** `AsistenciaResumen`. Do
  **not** widen `VentaResumen` — that silently changes the input contract of a live rule.
- Returns **raw numbers**, never formatted strings. Excel needs them summable; a chart needs them numeric.

**`calcularResumenMes` is NOT generalized to serve both.** It is hard-anchored on `hoy` with prior-month-**to-
date** semantics. Merging means a `modo` flag through a pure rule and risks moving the live dashboard's
numbers. **Prefer a little duplication over the wrong abstraction.**

**Prior-month comparison:** current month → prior month **cut to the same day** (like-for-like). Closed month →
**full** prior month. **Do NOT reuse `calcularResumenMes` by passing `hoy = last day of the month`** — its
cutoff is `venta.fecha.getDate() <= diaHoy`, so exporting **February** would cut January to **Jan 28**.
Current-month exports look fine, which is exactly how this ships broken and nobody notices until February.

**Month bounds** stay module-private in `respaldo.ts`. They cannot live in `@gym/domain` (`domain ✗→ format` is
blocked) and must not become a new `@gym/format` export (single caller). Compose `instanteEnZona` inline, as
`agenda.ts:211-212` already does.

**Sheet shaping** (`shapeResumen`) stays in `export/rows.ts` and **consumes** the fold's numbers, never
computes them.

### 2.4 Filename

`${sanitize(gym.slug)}-respaldo-${mes ?? "ultimos-24-meses"}.xlsx` → `red-respaldo-2026-07.xlsx`.

Sourced from the **membership-resolved gym**, never from `x-gym` (the host is attacker-influenceable —
ADR-0008 — and absent on unmapped hosts). **Sanitize at the header sink**: `gym.slug` has **no format CHECK**
in the DB and flows into `Content-Disposition` → quote/CRLF injection. Strip to `[a-z0-9-]`. The header must
not depend on a DB constraint that does not exist.

### 2.5 The picker, and the cap

Server-rendered `<form method="get">` on the Cuenta screen — a `<select name="mes">` + submit. No client JS;
`Content-Disposition: attachment` already forces the download.

Options: every month from the gym's first activity to the current one (newest first), plus
**`Últimos 24 meses`** (value = empty → the no-param path).

**Month list = two single-row ordered index lookups, NOT `min()`.** Under this RLS, `min(fecha)` is a full
cross-tenant seq scan on **every render of the Cuenta page** (→ 22 minutes at 3,000 gyms). With the §1.9 index:

```ts
.from("ventas").select("fecha").eq("gym_id", gym.id).order("fecha", { ascending: true }).limit(1)
.from("clientes").select("created_at").eq("gym_id", gym.id).order("created_at", { ascending: true }).limit(1)
```
Expand earliest → current month in JS, in the gym's zone. O(1).

**The cap replaces full history.** The unbounded export has three kill switches — quadratic OFFSET paging under
RLS, ExcelJS OOM at ~500–600k rows, and Vercel's **4.5 MB response-body cap** (the route **buffers**, it does
not stream) which trips **first**, at ~400k rows ≈ **3 years for a busy gym**. 24 months ≈ 90k rows ≈ 1 MB — a
4–6× margin. **Nothing becomes unreachable: every past month stays individually downloadable via the picker.**

> **Consequence, deliberate:** `respaldo.test.ts:96-97` (`expect(gteCalls["ventas"]).toEqual([])`) was the
> machine-guard on ADR-0006's "no windowing" clause. **Amending the ADR means amending its test.** It is
> replaced by an assertion of the 24-month bound. This is the one test in the suite that is *supposed* to
> change; it is not collateral damage.

### 2.6 ADR-0006 amendment (in place, dated)

> **Amended 2026-07-13 (month-scoped mode).** The export is no longer an unbounded full snapshot: the default
> is **the last 24 months**, and `?mes=YYYY-MM` selects a single gym-local month. Windowing now earns what it
> did not in 2026-06 — monthly totals — and the unbounded snapshot proved to be a memory/response-size bomb
> (§2.5). Each file still **stands alone**, which is the property this ADR actually cares about. The window is
> a half-open **instant** interval on `ventas.fecha` (timestamptz) and a half-open **day** interval on
> `asistencias.fecha` (date); that asymmetry is deliberate.

---

## Part 3 — Tests

**Must exist (they are the proof, not the paperwork):**

- **The bug, as a test:** a venta at **23:30 local on the last day of the month** lands in **that** month's
  Resumen and **not** the next. Fails on any day-string implementation. This is the whole reason Part 1 exists.
- **February:** exporting a closed February compares against **full January**, not Jan 1–28.
- **Bounds, pinned by type:** `?mes=2026-07` → ventas got `gte 2026-07-01T06:00:00.000Z` / `lt
  2026-08-01T06:00:00.000Z` (**instants**), asistencias got `gte 2026-07-01` / `lt 2026-08-01` (**day
  strings**). Pins the asymmetry so nobody "harmonizes" it later.
- **`resumen.ts` behaviour-neutrality:** ingresos/ventas/semana identical before and after §1.8. The
  "changes no number" claim, machine-checked. Plus a **UTC-positive** zone case (`Asia/Tokyo`) — the one
  configuration where the current code is genuinely wrong.
- **`instanteEnZona` DST suite** (`fecha.test.ts` has **zero** DST zones today): Santiago fall-back day bound;
  Santiago + Havana **nonexistent** local midnights; Havana **ambiguous** midnight (a month bound — must pick
  the earlier); Tijuana 06:00 on both transition Sundays (the live Agenda bug); `Asia/Beirut` UTC-positive
  control; `America/Bogota` fixed-offset control. Plus `materializarSesion` on Tijuana.
- **Tenant isolation:** the four export reads carry `.eq("gym_id", …)`; a fake multi-membership operator gets
  **one** gym's rows.
- **`supabase-fake.test-helper.ts` must grow `.lt()` + `ltCalls`** (it has neither — a `.lt()` throws today)
  and seed `slug`. Named present need: the upper bound is otherwise unassertable.

---

## Deferred — with named triggers, not forgotten

| Item | Trigger |
|---|---|
| **Year 3+ retention / archival** (owner's Cloudflare proposal) | Own session. Analysis in the findings doc: the index — not archival — is what fixes scaling; disk is tens of dollars; archiving raw rows to object storage forks every read path, mints a PII breach surface, and may violate SAT's ~5-year retention rule. If it ever earns its keep: **declarative partitioning by year + detach + dump**, not a bespoke pipeline. Never archive `ventas`. |
| Monthly rollup table (`resumen_mensual`) | When the **analytics page** lands. 3,000 gyms × 12 × 10yr = 360k rows — permanent multi-year trends without reading a raw attendance row. |
| RLS predicate rewrite to an uncorrelated form (`gym_id in (select staff_gyms())`) | Any gym-scoped admin result set routinely > ~50k rows, or admin p95 > 500ms. Converts "every reader must remember `.eq`" from a convention into a property. |
| `Intl.supportedValuesOf("timeZone")` validation on `gym.timezone` | The **onboarding write path** (none exists today; the 4 rows are hand-seeded). Note `"CST"` is silently accepted by `Intl` → resolves to `America/Chicago` (a **DST** zone) → **wrong month, forever, no error.** All other junk fails loud, which is correct. **No runtime fallback** — a silent default would relabel a gym's revenue month. |
| `pais`/`locale` on `gym` | **The first non-Mexican gym.** `waLink()` hardcodes **`+52`** and `TEL_DIGITS = 10` (mirrored into a DB CHECK) **rejects Chilean and Peruvian mobiles at intake**. Non-Mexican gyms do not work today. This blocks "3,000 gyms across LatAm" outright, and it is bigger than month labels. |
| Rename `ventas.fecha` → `ocurrio_en` | Next time the schema is opened for another reason. **The name is what lied** — `fecha` means an instant here and a business day in `asistencias`, which is why the bug was invisible at review. |
| `requireOperator` rename | It is a **presence check**, not an authorization gate, and its name teaches every future route author otherwise. |
