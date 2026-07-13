# Respaldo mensual — feature design + the base defects it exposed

**Date:** 2026-07-13
**Status:** design approved (Sections A+B); base fix under evaluation (5-agent proposal round)
**Trigger:** owner asked to make the Excel backup month-scoped, with sales totals per month.

---

## 1. The feature, as approved

Today `/cuenta/respaldo` (admin → Cuenta → DESCARGAR RESPALDO) streams a **full-history**, 4-sheet
ExcelJS workbook (Clientes, Ventas, Asistencias, Paquetes) with **no date filter and no totals**.
ADR-0006 chose that deliberately ("full snapshot, no delta; windowing earns nothing").

Owner decisions taken during brainstorming:

| Decision | Choice |
|---|---|
| How a month is selected | **One picker** on Cuenta: months-with-data (newest first) + `Todo el historial`. Param `?mes=YYYY-MM`. |
| Does full history survive | **Yes** — no-param request stays byte-identical. Backup role preserved. |
| Clientes sheet, month-scoped | **Altas del mes** only (clients whose `created_at` falls in the month). `Paquetes` stays full catálogo. |
| Estado/Urgencia in a past month | Cannot be reconstructed (no history table) — they stay **today's** values, and the sheet says so. |
| Totals depth | **TOTAL row on Ventas + a Resumen sheet** (ingresos, ventas, ticket promedio, desglose por método, altas, asistencias, prior-month comparison). |
| Partial month | Current month totals cut at download time — labelled `(parcial al DD MMM)`. |
| Prior-month comparison | Current month → prior month **cut to the same day** (like-for-like). Closed month → **full** prior month. |
| Month list source | One cheap query (earliest venta / earliest alta) → every month from first activity to now. |

**Month workbook = 5 sheets:** `Resumen` (first), `Ventas` (+ bold TOTAL row), `Asistencias`, `Altas`,
`Paquetes`. Resumen is 3 columns (`Concepto | Monto | Cantidad`) so the peso number-format lands only
on money and counts stay plain integers. `RespaldoSheet` gains one optional `boldRows` field; the
workbook assembler stays dumb.

**Filename:** `<brand>-respaldo-2026-07.xlsx` (month) / `<brand>-respaldo-2026-07-13.xlsx` (full).

---

## 2. The base defects — why we stopped

Owner ruling: *"we can't construct over a bad base, otherwise when we try to fix them we're going to
have to deal with all the building on top of it."* Building the monthly export on today's base would
produce a workbook whose totals **disagree with the dashboard card on the same screen**.

### D1 — the month boundary is wrong (live money-reporting bug, predates this feature)

- `ventas.fecha` is `timestamptz not null default now()`
  (`supabase/migrations/20260530023224_create_ventas_core.sql:59`).
  `asistencias.fecha` is `date not null` (`20260530031218_create_asistencias.sql:9`).
  **The same column name means an instant in one table and a business day in the other.**
- Every windowed read compares that timestamptz to a **bare ISO day string**:
  - `packages/data/src/server/resumen.ts:31` — `.gte("fecha", desdeIso)`
  - `packages/data/src/server/clientes.ts:154` — `.gte("fecha", monthStartIso(hoy))`
  - `packages/data/src/server/clientes.ts:253` — `.gte("fecha", ventanaIso)`
- Postgres coerces `'2026-06-01'` to midnight in the **session TimeZone (UTC under PostgREST)**, but the
  gym's month begins at midnight **America/Chihuahua (UTC−7/−6)**. Sales made late on the last evening
  of a month land in the **next** month's totals.
- The **display** path converts correctly (`fechaEnZona(v.fecha, tz)`,
  `packages/data/src/server/export/rows.ts:174`). So **filters and rows disagree with each other.**
- Consequence: "RESUMEN DEL MES" on the Cuenta screen (`getResumenMes` → `calcularResumenMes`,
  `packages/domain/src/rules.ts:229`) is already wrong at month edges — on the same screen as the
  download button.

Contrast: the Agenda path does it right — `agenda.ts:108` windows on real instants
(`.gte("starts_at", low.toISOString())`). The knowledge exists in the repo; the ventas readers don't use it.

### D2 — the export filename is brand-hardcoded

`apps/admin/src/app/(app)/cuenta/respaldo/route.ts:43` emits `forge-respaldo-<date>.xlsx` for **every**
tenant, RED included. The host→inquilino→marca seam (`resolveTenant` → `x-gym` + `x-brand`, ADR-0012)
already exists and is ignored here.

### D3 — no single home for "the gym-local business day of a venta"

Re-derived at each call site: correctly at display, incorrectly at filter. Whether consolidating this is
warranted — or is over-abstraction — is an open question put to the proposal round.

---

## 3. The 5-agent proposal round — verdict

Five independent Opus agents, identical scope, both gates (Elegance Check, Senior Dev Approval),
keep-it-lean clause. **All five converged. All five contradicted §2 above in the same three ways.**
Every one of them reported that both gates *rejected their first pass* — and rejected it for the same
reason: they had trusted the brief instead of reading the DDL.

### §2 above is CORRECTED — what was wrong

| Claim in §2 | Verdict (5/5 agreement) |
|---|---|
| `clientes.ts:154` + `clientes.ts:253` are defective | **FALSE.** Both filter **`asistencias`** (`.from("asistencias")` at :151 and :249), whose `fecha` is a **`date`**. `date >= 'YYYY-MM-DD'` is exact — no coercion. **They are correct. "Fixing" them would inject a real off-by-one-day bug** into the roster's this-month attendance count and the ficha's 30-day window. **Do not touch.** |
| The RESUMEN DEL MES card is wrong today | **FALSE.** `resumen.ts:42-45` converts every row via `fechaEnZona(v.fecha, tz)` **before** `calcularResumenMes` buckets it (`rules.ts:245-253`, on `mismoMes`/`difDias` over gym-local Dates). The SQL `.gte` is a **fetch** bound, not the bucketer. Chihuahua is west of UTC → UTC-midnight is *earlier* than gym-midnight → the fetch is a strict **superset**; the extra rows score 0 in every branch. **The card is correct. The fix changes no number the owner sees.** |
| "UTC−7/−6" | **Stale.** Mexico abolished DST in 2022 → `America/Chihuahua` is **fixed UTC−6, no DST**. (Note: `America/Ciudad_Juarez` *does* still observe DST — a real future-gym risk.) |

### What is actually true

**Exactly one defective call site in the whole DAL: `resumen.ts:31`.** It is the only place a
`ventas.fecha` timestamptz is ever compared to a bare day string. It is **latent, not live** — it
survives on three coincidences: lower-bound-only, UTC-negative zone, and bucketing done later in pure code.

**It detonates the moment an upper bound is added — which is exactly what `?mes=` requires.**
`.lt("fecha", "2026-08-01")` coerces to `2026-08-01T00:00Z` = **2026-07-31 18:00 local** → silently
chops the last 6 hours of the month's final day.

**Live blast radius (read-only queries against prod, 3 agents independently):**

| fact | value |
|---|---|
| gyms | 4 — `forge`, `forge-demo`, `red`, `red-demo` — **all `America/Chihuahua`** |
| PostgREST session `TimeZone` | **`UTC`** |
| ventas rows | 41 |
| ventas where **UTC day ≠ gym-local day** | **13 (32%)** — all evening sales, 18:01–21:33 local |
| forge alone | **12 of 22 (55%)** rung up at ≥18:00 local |
| ventas where **UTC month ≠ gym-local month** | **0** |
| naive-vs-correct month totals (May/Jun/Jul) | **identical** |

> A loaded gun with an empty chamber. The evening band is where a third to a half of all sales happen;
> no such sale has landed on a month's last day **yet**. Pure luck.

### D3 answered: the home is NOT missing — one call site never moved into it

`instanteEnZona(diaLocal, hhmm, tz)` (`packages/format/src/fecha.ts:128`) already **is** the home. Its own
docstring: *"every reader window bound resolves through here."* ADR-0010 §k says the same. Six correct
callers already: `agenda.ts:211-212,236-237`, `agenda-miembro.ts:185-186`, `marketing.ts:290-291`.
**`ventas` is the lone holdout.** A new `mesEnZona()` helper was proposed by 4 of 5 agents on their first
pass and **killed by their own Elegance gate** — it would be a second home for knowledge that already has
one, and it would *conceal* the load-bearing fact (ventas needs instant bounds, asistencias needs day
bounds). **The knowledge goes in a comment, not a module.**

### Rejected by all five (with the killing fact)

| Alternative | Why it dies |
|---|---|
| Generated `ventas.dia_local` column | The zone lives in **another table** (`gym.timezone`); a generated expression may only reference its own row. Degrades to denormalized-tz + trigger + backfill on the **money table**, on a free tier with **no backups**, dragging in the mandatory `test:denial` scratch gate — to replace one line of TypeScript. |
| A `ventas_local` view / RPC-side window | Buys a filter the app already expresses. Adds a migration (⇒ full gate), a second PostgREST surface with RLS to re-reason, and splits "what a month is" across SQL and TS. Pure cost. |
| `ventas.fecha` → `date` | **Destroys the instant, which is load-bearing.** `clientes.ts:283` anchors the C14 clases-gauge on the venta's gym-local `HH:MM:SS` so a same-day pre-renewal check-in isn't double-counted. Data-losing, RPC-breaking. Hard no. |
| Rename `ventas.fecha` → `ocurrio_en` | The honest root fix — **the name is what lied**. But live DDL on the money path + coordinated deploy + denial suites, for zero behavior change. **Recorded as a next-touch obligation, not shipped.** |

### The chosen shape (5/5)

**App-layer only. Zero migrations ⇒ the `pnpm test:denial` scratch gate never fires, no live DDL on a
backup-less money table, revert = `git revert`.** Two commits:

**Commit 1 — fix the base** (behavior-neutral, provable, mergeable on its own):
- `resumen.ts` — `.gte("fecha", instanteEnZona(desde,"00:00",tz).toISOString())` for **ventas**; leave the
  **asistencias** day-string bound exactly as-is. The two differently-typed bounds now sit side by side in
  one `Promise.all` — the asymmetry *is* the fix, and it gets the comment.
- `resumen.test.ts` — **NEW. This reader has no test today. That absence is the real base defect.**
  Assert the ventas bound is an ISO **instant** (`…T06:00:00.000Z`), the asistencias bound is a bare day,
  and add a **UTC-positive zone** case (`Asia/Tokyo`) — the one configuration where the current code is
  genuinely wrong.
- `gym.ts` — `.select("slug, timezone")`; `OperatorGym` gains `slug`. Additive; ~15 callers all destructure
  `{ timezone: tz }` and are unaffected.
- `route.ts` — filename from `gym.slug` (**D2**), **sanitized** at the header boundary:
  `gym.slug` has **no format CHECK** in the DB (`slug text not null unique`) and flows straight into a
  `Content-Disposition` header → CRLF/quote injection vector. Strip to `[a-z0-9-]`.
  Source it from the membership-resolved gym, **never** from `x-gym` (host is attacker-influenceable,
  ADR-0008, and absent on unmapped hosts).

**Commit 2 — the export, on the fixed base:** `?mes=YYYY-MM` (validated `^\d{4}-(0[1-9]|1[0-2])$`, invalid
→ 400, absent → full history **byte-identical**). Ventas windowed on half-open **instant** bounds,
asistencias on half-open **day** bounds, clientes windowed on `created_at` instants (Altas del mes),
paquetes unwindowed. Resumen sheet = a **pure fold over the already-windowed `data.ventas`** — so it
cannot disagree with itself, and agrees with the Cuenta card *by construction*, not by coincidence.

**`respaldo.test.ts:96-97` (`gteCalls["ventas"] === []`) stays verbatim and stays green** — it guards the
default full-history path, which commit 2 does not change.
**`supabase-fake.test-helper.ts` must grow `.lt()` + `ltCalls`** (it has neither — a `.lt()` throws today).
Named present need: the month window's upper bound is otherwise unassertable.

### Trap caught by agent D — do NOT reuse `calcularResumenMes` for a closed month

Its prior-month cutoff is `venta.fecha.getDate() <= diaHoy`. Passing `hoy = last day of the month` to
export **February** would cut January to **Jan 28**, violating the owner's "closed month → full prior
month" ruling. The Resumen sheet gets its own pure fold. Current-month exports would have been fine —
which is exactly how this ships broken and nobody notices until February.

---

## 4. Open questions for the owner

1. **`metodo = 'pendiente'` (por pagar) — raised independently by 2 agents, and it is a real fork.**
   `calcularResumenMes` sums **every** venta regardless of método → **the Cuenta card already counts
   unpaid sales as income.** If the Resumen sheet excludes them, the card and the export disagree — the
   precise failure this whole exercise exists to prevent. **Live: 0 pendiente rows today → free to decide
   now, expensive later.** Recommendation: match the card (include all), break `pendiente` out as its own
   line so the number is legible.
2. **ADR-0006 amendment.** "Full snapshot, no delta … windowing earns nothing" is directly contradicted by
   `?mes=`. Amend in place (dated, like the 2026-07-02 mail-provider clause): the **default** stays the
   full snapshot (clause intact, regression test retained); `?mes=` is an **additional** operator view.
3. **Filename token.** `gym.slug` → `red-respaldo-2026-06.xlsx`, but also `forge-demo-respaldo-…` for the
   demo twins. Slug, or brand name? (Brand name would make both Forge gyms emit the same filename.)
4. ~~Fixing D1 changes numbers the owner sees~~ — **withdrawn. It changes nothing. Proven, not assumed.**

---

# PART II — the 3,000-gym audit (2026-07-13, second round)

Owner asked the real question: *is this feature multi-tenant-safe, leak-free, and shippable to 3,000+ gym
owners across Latin America — and does it foreclose a future admin analytics page?*

Four more Opus agents, distinct lenses, both gates each. **The timezone defect in Part I turns out to be
the SMALLEST of the base defects.** Two release-blockers were found that have nothing to do with months.

---

## 5. BLOCKER 1 — cross-tenant leak, reachable today, no privilege escalation

**Verified live by me, not just by the agent.** Three facts:

1. **`paquetes` has no staff SELECT policy.** The only `authenticated` read policy is
   `paquetes_member_select` → `is_member_of(gym_id)`, **not** `is_staff_of`. `is_member_of` is true for
   **any** gym you hold **any** membership in.
   ```
   paquetes_member_select | {authenticated} | SELECT | (SELECT is_member_of(paquetes.gym_id))
   paquetes_anon_select   | {anon}          | SELECT | true
   ```
2. **`reclamar_o_crear_cliente(p_gym_id uuid)` mints a membership in ANY gym you name.**
   `SECURITY DEFINER`, `EXECUTE` granted to `authenticated`, gym id is a **caller-supplied parameter**:
   ```sql
   insert into public.gym_membership (user_id, gym_id, role)
     values (v_uid, p_gym_id, 'member') on conflict (user_id, gym_id) do nothing
   ```
   Nothing binds `p_gym_id` to the caller's host or existing gym.
3. **`gym` is world-readable** — `gym_anon_select USING (true)` for `anon` **and** `authenticated`, all
   columns → hands out every `gym.id` (the exact input #2 needs), plus `legal_name` and `owner_user_id`.

**The chain:** any authenticated user reads `gym` → picks a competitor's `gym_id` → calls
`reclamar_o_crear_cliente(<that id>)` → holds a `member` row there → `is_member_of` goes true → and
because `getRespaldoData` reads `paquetes` with **no `gym_id` filter**, their next backup contains the
**competitor's price catalog**, in a file stamped with their own gym's name. Demonstrated read-only:
4 forge-demo + 3 red-demo packages = **a 7-row Paquetes sheet in a file labelled `forge`**.

**Not caused by this feature.** Pre-existing. Latent only because live has **zero** multi-membership users
today. Stops being latent the first time a gym owner signs up as a client anywhere — ordinary behavior.
The same unfiltered read is also in the **/vender package picker** (`paquetes.ts:38`, `:82`).

**`clientes`/`ventas`/`asistencias` ARE correctly guarded** by `is_staff_of` — so a plain member hitting
`/cuenta/respaldo` gets their own row and nothing else. **The PII-roster breach does not exist.** RLS holds
for those three. But they union too **the moment one user holds staff roles in two gyms**, which the
roadmapped multi-gym picker makes routine — and then it IS a PII merge.

**Two more, same root:**
- `getOperatorGym` (`gym.ts:46-51`) picks the gym with `.limit(1)` and **no `ORDER BY`** →
  nondeterministic. With two memberships it is a coin flip; if it lands on the `member` row, the real
  operator is **locked out of their own admin app**. The SQL helper `staff_gym()` has the identical bug,
  and `registrar_venta` uses it to stamp `gym_id` on **money rows**.
- `readAllAsistencias` pages by OFFSET ordered on `fecha` (a `date`) with **no unique tiebreaker**; live
  already has 15 rows sharing one date. Past 1,000 rows ties reorder across page boundaries → **rows
  silently duplicated and dropped**. The file's own comment promises "the COMPLETE ledger, no silent
  truncation." That promise is **false** for any gym over 1,000 asistencias.

---

## 6. BLOCKER 2 — the RLS predicate is non-sargable. It breaks at ~40 gyms, not 3,000.

**ADR-0013 is wrong, in writing, and its "never touch this" clause would make a reviewer delete the fix.**

```
ventas_staff_select USING ( SELECT is_staff_of(ventas.gym_id) )
```

The Supabase `(select …)` wrapper only hoists when the subquery is **uncorrelated**. `(select auth.uid())`
has no row reference → InitPlan → once per statement. `(select is_staff_of(gym_id))` **references the
row's own column** → **correlated SubPlan** → **once per row of the entire cross-tenant table**, and the
planner cannot turn it into an index condition.

**Live proof (`pg_stat_user_tables`, verified by me):**

| relname | n_live_tup | seq_scan | idx_scan |
|---|---|---|---|
| **`gym_membership`** | **6** | **214,861** | 864 |
| `clientes` | 41 | 2,373 | 1,271 |
| `ventas` | 41 | 1,574 | **61** |

**214,861 sequential scans of a 6-row table** — the RLS helper firing per-row, in prod, on 4 gyms.
`ventas_gym_id_idx` is essentially unused. `EXPLAIN` on the export's real query shows
`Seq Scan … SubPlan 1 … loops=41` (every row in the table).

**What ADR-0013 claims:**
> `:31` — *"the helper evaluates **once per statement, not once per row** … the 2026-07-01 scale audit
> confirms this is O(1)-per-statement at all-Mexico scale."*
> `:63` — *"**Never unwrap** `(select helper(gym_id))` … that reverts O(1)-per-statement to per-row."*

It is **already** per-row. Both clauses must be corrected, or the next reviewer deletes the fix as
"redundant."

**Where it dies:** `authenticated` `statement_timeout = 8s` (verified) ÷ 18.7 µs per call ≈
**428,000 rows scanned platform-wide per query** — not per gym, *platform-wide*, because there is no
`gym_id` predicate to narrow it.

| platform `asistencias` | outcome |
|---|---|
| 268 (today) | 5 ms — why nobody noticed |
| **430,000** | **8.0 s → statement timeout → 500** |
| 3,000 gyms × 1 month (10.8M) | 202 s — dead |

430k ÷ ~3,600 rows/gym/month ≈ **119 gym-months → breaks at 10–40 real gyms.** And it is **shared-fate**:
a brand-new gym with 3 rows of its own gets a 500, because the scan is everyone's. **The dashboard and
roster share the defect** (`clientes.ts:62/91/145/194`, `asistencia.ts:56/161`) — the export is just where
it detonates first.

### The two audits converged on the same one-line fix

- The **security** agent wanted `.eq("gym_id", gym.id)` to stop the **cross-tenant union**.
- The **scale** agent wanted `.eq("gym_id", gym.id)` to restore the **index scan**.

Same four lines. **`gym.id` is already returned by `getOperatorGym` and currently thrown away**
(`respaldo.ts:115` destructures only `{ timezone: tz }`). Proven live: adding the eq flips
`Seq Scan` → `Index Cond: gym_id = …` and collapses RLS calls from 41 to 3.

**This does not violate ADR-0001.** The `.eq` is **not a boundary — it is a scope selector.** RLS answers
*"may I see this row?"* (and remains the boundary). The export additionally needs *"which of the rows I
may see belong to the gym whose name I am stamping on this file?"* — and RLS **structurally cannot**
answer that, because its predicate is per-row-per-gym, not "the caller's gym." The export is the only
endpoint that materializes everything into **one artifact bearing one gym's identity**.

---

## 7. BLOCKER 3 — the full-history export is already a bomb, independent of everything above

Measured with this repo's actual `exceljs@^4.4.0`, mirroring `workbook.ts`, at Vercel's 2 GB default
(no `vercel.json` exists; `next.config.ts` sets no `maxDuration`/`memory` → defaults apply):

| gym `asistencias` | peak RSS | .xlsx |
|---|---|---|
| 216k (5 yr) | 1,373 MB | 3 MB |
| 400k | 1,428 MB | **5 MB** |
| 600k | **1,910 MB** | 7 MB |
| 1.44M | **FATAL: JS heap OOM** | — |

**Three independent kill switches:**
- **A — OFFSET pagination is quadratic under RLS.** `.range()` = `LIMIT/OFFSET`; OFFSET discards rows
  *after* the filter, so page *k* pays the RLS SubPlan for every row it skips. 216 pages ≈ 436 s of pure
  RLS. (Today, without the eq, page 1 alone blows the 8 s timeout.)
- **B — ExcelJS OOM at ~500–600k rows.**
- **C — Vercel's 4.5 MB response-body cap.** The route **buffers** (`route.ts:47`), it does not stream →
  `413 FUNCTION_PAYLOAD_TOO_LARGE` at ~400k rows. **This trips FIRST.**

**~3–4 years for a busy gym (300 members × 12 check-ins/mo).** The month-scoped mode is the accidental
fix for all three. **A month ≈ 4k rows → <20 MB peak, ~100 KB file, 1 page.**

**Bonus latent corruption:** `PAGE = 1000` sits **exactly** on Supabase's default "Max rows" setting.
Set it to 500 in the dashboard (a natural reaction to a scale incident) and `if (page.length < PAGE) break`
terminates after one page → **every export silently truncates, dropping the OLDEST history first** —
precisely the failure `respaldo.ts:16-23` claims to prevent.

---

## 8. Timezone, round 2 — my Part I hypothesis was ALSO wrong, and a live bug was found elsewhere

Agent ran `instanteEnZona` against real ICU across **30 LatAm zones × 16 years (2025–2040)**.

- **Month bounds: 0 failures.** Including the nonexistent local midnights (Havana 2026-03-08, Santiago
  2026-09-06) I called a release-blocker. **It is not one.** The helper returns the exact transition
  instant, which *is* the true start of that local day.
- **But it passes by coincidence:** no LatAm DST transition has ever landed on a 1st-of-month — a
  coincidence **Chile can revoke by decree**.

**The real defect: `instanteEnZona` (`fecha.ts:128`) is ONE-PASS.** It samples the offset at the *guessed*
instant (the wall clock reinterpreted as UTC), which for a UTC−N zone is N hours before the instant it is
computing. It is wrong whenever a transition falls in that window:

| Broken today | Impact |
|---|---|
| **`America/Santiago`** | day bound wrong by **−1h every April**, 16/16 years |
| **`America/Tijuana`, `America/Ciudad_Juarez`** | **the Agenda WRITE path, twice a year, live.** A 6:00 class on the DST Sunday is created at 7:00. `agenda.ts:373`, `:457` |
| **`rules.ts:427`** (`materializarSesion`) | duplicate one-pass copy, whose comment *"this app's class hours never straddle a DST transition"* is **false** — Tijuana disproves it |

**Fix: 6 lines, two-pass** (re-derive the offset at the candidate instant; on a gap keep the transition
instant, on an overlap keep the earlier). **Verified 0 regressions: 30 zones × 16 years × 365 day-starts,
plus 20,805 Agenda hours, plus a UTC-positive control (`Asia/Beirut`).**

**`fecha.test.ts` contains ZERO DST zones today** — its own header admits it. Every existing test passes
against a helper that ignores DST entirely.

**`gym.timezone` has no CHECK, no FK, no default.** Junk mostly fails loud (`RangeError` → 500, which is
**correct** — for money, crash beats a wrong number). **Except `"CST"`**, which `Intl` silently resolves to
`America/Chicago` (a **DST** zone) → **wrong month, forever, no error.** Guard:
`Intl.supportedValuesOf("timeZone").includes(tz)` — one line, at the onboarding write site. **No runtime
fallback** — a `?? "America/Mexico_City"` would silently relabel a gym's revenue month.

**Corrections to my Part I brief:** `America/Asuncion` has **no** DST (Paraguay abolished it in 2024).

**Not our feature, but fatal to "3,000 gyms across LatAm":** `waLink()` (`format.ts:70`) hardcodes **`+52`**,
and `TEL_DIGITS = 10` (`format.ts:41`, mirrored into a **DB CHECK**) **rejects Chilean and Peruvian mobiles
at intake** (9 digits). **Non-Mexican gyms do not work today.** Month labels are the least of it.

---

## 9. The analytics page — one placement decision, and it is free

Owner's stated next step: an admin **Analytics page** with graphed monthly trends.

**It is not foreclosed — provided ONE decision goes right:** the pure monthly fold and **its types** live in
`packages/domain/src/rules.ts` + `types.ts`, **not** in `packages/data/src/server/export/rows.ts`.

This is **machine-enforced, not taste.** `.dependency-cruiser.cjs` blocks `@gym/ui ✗→ @gym/data`, so if the
fold's output type is declared in the spreadsheet module, **a future chart component literally cannot name
it in its props.** And `domain ✗→ data` means a domain fold cannot even name its *inputs* if they live in
`rows.ts` — which is exactly what today's `RespaldoData` does (`respaldo.ts:8-14` imports its own return
type **from the spreadsheet module**). **The existing precedent points straight at the wall.**

Same line count either way. One is reusable; the other is a rewrite.

- **(a) the pure fold** → `@gym/domain/rules.ts`. Takes **already-fetched rows + a month anchor**, fetches
  nothing, reads no clock (mirrors `calcularResumenMes`). **This shape is what defuses the N+1**: a future
  12-month trend page adds ONE windowed reader and calls the fold 12× over the in-memory set. An addition,
  not a rewrite.
- **(b) the month-window bounds** → module-private in `respaldo.ts`. It *cannot* live in `@gym/domain`
  (needs `@gym/format`; `domain ✗→ format` is blocked) and must not be a new `@gym/format` export
  (single caller). Compose `instanteEnZona` inline, as `agenda.ts:211-212` already does.
- **(c) the DAL reader** → `respaldo.ts`. A chart can never call it (`ui ✗→ data`) — and never should; the
  future *page* (a server component in `apps/admin`) calls the reader and passes numbers down as props.
- **(d) the Resumen *sheet* shaper** → stays in `export/rows.ts`. **Consumes** the fold's numbers, never
  computes them.

**Rejected as over-building** (deletion test applied to each): generic `ResumenPeriodo(desde, hasta)`,
multi-month reader, chart-data DTO, a `metrics` package, caching/materialized aggregates, config-driven
aggregation, hoisting `mesBounds()` into `@gym/format`, and **generalizing `calcularResumenMes` to serve
both** (it is hard-anchored on `hoy` with prior-month-**to-date** semantics; merging means a `modo` flag
through a pure rule and risks moving the live dashboard's numbers — prefer duplication).

### SPEC BUG — `metodo = 'pendiente'` does not exist

`20260710120000_renewal_schema_prep.sql` dropped the old check and re-added
`check (metodo in ('efectivo','transferencia','tarjeta'))` — **no `NOT VALID`**, so Postgres validated
existing rows. **Verified live:**
```
ventas_metodo_check  CHECK (metodo = ANY (ARRAY['efectivo','transferencia','tarjeta']))
```
A "Por pagar" line would be **provably always $0** — a dead legend entry a future chart would inherit.
Two agents said *"0 pendiente rows today"* — true, but for the wrong reason: **impossibility, not
coincidence.** **The desglose is 3 buckets.** Owner decision #1 from §4 is void; card-vs-export agreement
is automatic.

---

## 10. Consolidated work order

**P0 — ship-blockers, before any month feature:**
1. `.eq("gym_id", gym.id)` on the 4 respaldo reads (`respaldo.ts:118-129`). **Fixes the leak AND the seq
   scan.** `gym.id` already in hand. No migration.
2. Deterministic `getOperatorGym` — `.in("role", ["owner","operator"])` + `.order("gym_id")`; return `slug`
   too (`gym.ts:46-60`).
3. Route: validate `?mes=` (`^\d{4}-(0[1-9]|1[0-2])$` → 400); **sanitize `gym.slug` at the header sink**
   (no CHECK on it → `Content-Disposition` injection); `getOperatorGym`'s throw → **403**, not 500.
4. Same `.eq("gym_id")` on the other staff readers (`clientes.ts:62/91/145/194`, `asistencia.ts:56/161`,
   `paquetes.ts:38/82`). Same one-line fix, same live failure.
5. **Correct ADR-0013 §2 and its "never unwrap" clause.** Doc-only, zero risk — and the only thing that
   stops fixes 1 & 4 from being deleted as "redundant" at the next review.
6. Unique tiebreaker on both paginating readers (`.order("id")` / `.order("folio")`).
7. **Two-pass `instanteEnZona`** (`fecha.ts:128`) + the duplicate in `rules.ts:427` + delete its false
   comment. Fixes a **live** Tijuana/Juárez Agenda write bug.
8. `resumen.ts:31` — window ventas on `instanteEnZona`, leave the asistencias day-string bound alone.

**P0 — one migration (index-only; no RPC write change → no new denial assertions, one green scratch run):**
```sql
create index ventas_gym_fecha_idx      on public.ventas      (gym_id, fecha);
create index asistencias_gym_fecha_idx on public.asistencias (gym_id, fecha) where deleted_at is null;
```
**Build now, while the tables are 41 / 268 rows.** Deferring means creating them on a 648M-row table
during an incident.

**Then the feature** (`?mes=`, Resumen sheet, picker, slug filename, ADR-0006 amendment).

**Owner decisions — see §11.**

## 11. Owner decisions (open)

| # | Decision | **RULING (owner, 2026-07-13)** |
|---|---|---|
| D1 | Full-history export: retire, cap, or stream? | **CAP at 24 months.** `Todo el historial` → `Últimos 24 meses`. Bounded by construction; all three kill switches disarmed; no streaming machinery. Every past month stays individually downloadable via the picker, so nothing becomes unreachable. |
| D2 | `reclamar_o_crear_cliente(p_gym_id)` lets any authed user mint a membership in any gym. | **FIX NOW, this release.** Bind `p_gym_id` to the resolved tenant. Migration → takes the `test:denial` gate. |
| D3 | `gym_anon_select USING (true)` exposes `legal_name` + `owner_user_id`; `paquetes_anon_select` exposes every gym's pricing. | **NARROW with column GRANTs.** Keep the policy (the pre-auth brand seam needs an anon read); revoke table-wide SELECT and grant only the brand-seam columns. |
| D4 | Do the other staff readers + the ADR-0013 correction ride this release? | **YES, ride it.** Same root cause, one line each. Splitting means shipping a corrected `respaldo.ts` that the next refactor "cleans up" back into a seq scan. |
| D5 | Non-Mexican gyms don't work (`+52` hardcoded, `TEL_DIGITS=10` rejects Chile/Peru). | **Out of scope, flagged.** Blocks "3,000 gyms across LatAm" outright. Needs its own slice before any non-MX onboarding. |

---

## 12. Retention / archival at 3,000 gyms — analysed, DEFERRED to its own session

**Owner's proposal:** archive data older than 24 months out of Postgres into Cloudflare (R2), so the DB holds
only 2 years per gym and doesn't get overloaded.

**The instinct is right — unbounded growth is real and nobody had decided what happens to year 3+:**
```
300 members × 12 check-ins/mo = 3,600 rows/gym/month
× 3,000 gyms × 12 months      = ~130M asistencias/year   (~650M over 5 years, ~100–200 GB with indexes)
```

**But the stated mechanism does not solve the stated problem.**

- **"The DB gets overloaded" — it doesn't, once the index exists.** With `(gym_id, fecha)`, a one-gym-month
  query is a B-tree descent + ~3,600 rows. That cost is **essentially independent of table size** (1M → 650M
  rows takes the index from ~3 levels to ~5). **One gym's queries never touch another gym's rows.** So 3,000
  gyms' data does **not** slow any single gym down — *once the predicate is sargable*.
- **What actually "overloads" the DB is §6 — the cross-tenant seq scan — which breaks at ~40 gyms.** Archiving
  would not fix it. Fixing it makes the row count a non-event. Archiving *without* fixing it still dies at 40
  gyms, just with less data.
- **So archival buys only disk**, and disk is the cheapest thing on the bill (order of magnitude: tens of
  dollars/month for 200 GB) — traded against a bespoke subsystem owned forever.

**And the mechanism has teeth:**
- **Every read path forks** ("is this hot or cold?") — the ficha, roster, analytics page, export. The most
  expensive kind of complexity: it never stays in one place.
- **It deletes rows from Postgres** on the correctness of a bespoke pipeline, on a tier with **no backups**.
- **The archived objects are PII** (names, phones, emails, birthdays, purchase history) for 3,000 tenants,
  parked in object storage — a durable breach surface minted immediately after closing a leak.
- **It may not be legal.** Mexico's SAT requires ~5 years of retention on accounting records. Deleting a gym's
  sales at 24 months could put **the gym** in violation. It is **their** data; deleting it because our table
  is big is a contractual promise, not an engineering choice.

**Recommended instead, in order:**
1. **Fix sargability + add the indexes** (§10). This *is* the scaling fix; row count stops mattering.
2. **Never archive `ventas`.** 3,000 gyms × 5 yr ≈ 72M rows — tiny, and legally the most valuable thing held.
3. **Monthly rollup table when the analytics page lands** (`resumen_mensual`: gym, mes, ingresos, ventas,
   altas, asistencias). 3,000 × 12 × 10 yr = **360k rows — nothing.** Permanent multi-year trends without ever
   reading a raw attendance row. **This is the elegant version of the owner's idea: summarize, don't ship to
   object storage.**
4. **If disk ever genuinely hurts** — named trigger: `asistencias` > 100M rows — use **declarative range
   partitioning by year**, then detach + dump old partitions to R2. Native, reversible, **no bespoke code in
   any read path**.
5. **Retention is a product/legal decision, not an engineering one.** A 2-year promise belongs in the ToS,
   with counsel — chosen, not forced by a big table.

**Status: DEFERRED to its own session** (owner ruling, 2026-07-13). Recorded as an open decision with a named
trigger; not built.
