# Resumen del Mes — honest period-over-period delta (prior-month-to-date)

> **Date:** 2026-06-05 · **Type:** design spec · **Scope tier chosen:** Tier 1 (minimal) · **Caption:** `VS PERIODO ANT.`
>
> **Provenance:** designed via a 9-agent judge-panel (3 semantics lenses + 1 boundary audit →
> 3 gate-judges + 2 adversarial verifiers). The chosen approach cleared an adversarial pass of
> **both** project gates — Elegance Check and Senior Dev Approval — as the unanimous winner.

## Problem

The `Resumen del Mes` card (rendered on **cuenta**, and the same DTO feeds **inicio**) shows three
running calendar-month-to-date totals — ingresos, ventas, asistencias — each with a small delta
caption comparing against the prior month. Today the delta divides **month-to-date** by the
**prior FULL month** (`calcularResumenMes` accumulates `*MesPrev` over all of `mesPrev`).

That comparison is apples-to-oranges **every day of the month**, not only at rollover: a perfectly
flat business reads ≈ `(N/M − 1) × 100%` on day `N` of an `M`-day month — negative until ~month-end.
The "−97% on the 1st" that prompted this work is just the extreme tail. The audit + both verifiers
graded this **HIGH** and confirmed it as the real product defect.

## Decision

Compare month-to-date against the **same elapsed slice** of the prior month —
**prior-month-to-date**. On day `N` we compare `[this month 1..N]` against `[prior month 1..N]`.
Equal exposure on both sides, honest from the 1st, and it self-converges to a true
full-month-vs-full-month read by the last day — exactly when the operator's billing instinct wants it.

Rejected alternatives (both generated and killed by the Elegance gate): **run-rate projection**
(invents a forecast nobody asked for; a single day-2 sale swings it ~15×) and **rolling-30-day**
(abandons the calendar-month frame the operator bills on and that the headline itself uses).

**Tier 1 (minimal)** scope, per operator decision: the truncation math + the coupled
`prev === 0` presentation split + the caption relabel. Two verified low-severity seams and one
out-of-scope client-freshness item are documented as deferred follow-ups (see **Deferred**).

The headline totals (`ingresosMes` / `ventasMes` / `asistMes`) **do not change** — only the
`*MesPrev` baseline that the delta divides by. (`*MesPrev` is consumed **only** by `DeltaCaption`;
grep-confirmed it never reaches **inicio**, so there is no dashboard ripple.)

## Change 1 — the pure rule (`src/domain/rules.ts`)

In `calcularResumenMes`, precompute the day-of-month once, then add a same-day-of-month cutoff to
the two existing prior-month accumulation branches. Nothing else in the function changes — the rule
stays pure (`hoy` is the only time source) and the DAL fetch window already contains these rows.

```ts
const mesPrev = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);
const diaHoy = hoy.getDate(); // NEW — prior-month-to-date cutoff

// ventas loop — prior-month branch:
} else if (mismoMes(venta.fecha, mesPrev) && venta.fecha.getDate() <= diaHoy) {
  ingresosMesPrev += venta.monto;
  ventasMesPrev += 1;
}

// asistencias loop — prior-month branch:
else if (mismoMes(asis.fecha, mesPrev) && asis.fecha.getDate() <= diaHoy) asistMesPrev += 1;
```

The `<= diaHoy` cutoff handles month-length mismatch for free: when `diaHoy` exceeds the prior
month's length (e.g. hoy = Mar 31, Feb maxes at 28), every prior-month row satisfies the cutoff, so
the comparison slice is the whole (already-elapsed) prior month — the correct reading, with no clamp.

## Change 2 — the caption (`src/app/(app)/cuenta/_components/cuenta.tsx`)

Two edits to `DeltaCaption`. `deltaPct` is unchanged (still returns `null` when `prev === 0`).

1. **Relabel:** `VS MES ANT.` → `VS PERIODO ANT.` so the words match the new math (the gate-deciding
   point — the "keep VS MES ANT." proposal *failed* Senior Dev + owner review for shipping a label
   that overstates what it compares).
2. **Split the `prev === 0` path** (the coupled, non-optional piece — see below):

```tsx
function DeltaCaption({ actual, prev }: { actual: number; prev: number }) {
  const pct = deltaPct(actual, prev);
  if (pct === null) {
    // prev === 0 → no like-for-like baseline. Distinguish "up from zero"
    // (real momentum this period) from genuinely-nothing-to-compare.
    if (actual > 0) {
      return (
        <div style={{ fontSize: 10, color: "var(--green)", marginTop: 4, fontWeight: 700 }}>
          ↑ NUEVO
        </div>
      );
    }
    return (
      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4, fontWeight: 600 }}>
        SIN MES ANT.
      </div>
    );
  }
  const color = pct > 0 ? "var(--green)" : pct < 0 ? "var(--gold)" : "var(--muted)";
  return (
    <div style={{ fontSize: 10, color, marginTop: 4, fontWeight: 700 }}>
      {pct > 0 ? "+" : ""}
      {pct}% VS PERIODO ANT.
    </div>
  );
}
```

**Why the split is non-optional (the find that justified the orchestration).** The audit + both
verifiers flagged (MEDIUM, in-scope, coupled) that truncating the baseline makes `prev === 0`
*more common* early in the month — the prior month's first days are often empty. Without this split,
the fix would trade a misleading "−97%" for an unhelpful muted **"SIN MES ANT."** that reads as
"no data" on a month that is actually growing from zero. So we must distinguish:
`prev === 0 && actual > 0` → green **"↑ NUEVO"** (momentum) from `prev === 0 && actual === 0` →
muted **"SIN MES ANT."** (genuinely no baseline). When `prev > 0`, the percentage shows as before.

**Caption readings under the new design:**

| State | Caption |
|---|---|
| `prev > 0` (any day) | `+18% VS PERIODO ANT.` (green/gold/muted by sign) |
| `prev === 0 && actual > 0` | `↑ NUEVO` (green) |
| `prev === 0 && actual === 0` | `SIN MES ANT.` (muted) |

**Testing the caption:** kept inline alongside the existing `deltaPct` (there is **no** app-component
unit-test setup — tests live only in `src/domain` + `src/lib`). The branch is a trivial, obviously-correct
mapping over props; the *risk-bearing* logic (when `*MesPrev` becomes 0) lives in the domain rule and
**is** unit-tested (the day-1 case below). Extracting a `captionState(actual, prev)` helper into
`src/lib` to unit-test the branch was considered and rejected as over-abstraction for a 3-branch
presentation decision (YAGNI; consistent with the existing inline `deltaPct`).

## Change 3 — docstrings

- `src/domain/types.ts` — the three `*MesPrev` fields: change from
  "Same three totals for the PRIOR calendar month (for period-over-period deltas)" to
  "Same totals for the prior calendar month **through the same day-of-month as `hoy`**
  (prior-month-to-date) — equal elapsed slice, so the delta compares like-for-like from day 1."
- `src/domain/rules.ts` — mirror the one-line update in the `calcularResumenMes` doc bullet that
  describes `*Mes` / `*MesPrev`.

## Tests (`src/domain/rules.test.ts`)

Existing fixture: `HOY = new Date(2026, 4, 27)` (Wed 27 May 2026), prior month = April, `diaHoy = 27`.

**Unchanged (regression guards — truncation touches only the prior-month branch):**
`ingresosMes` 1950, `ventasMes` 4, `asistMes` 9, hoy/ayer, `ingresosSemana` 1550, the weekly series.
Keep these assertions exactly to prove the headline did not move.

**Rewrite** `"totals the PRIOR calendar month for period-over-period deltas"` →
`"totals the prior month through the same day-of-month (prior-month-to-date)"`:
the `28 abr $700` venta (day 28 > 27) and the `30 abr` asistencia (day 30 > 27) now fall outside the
slice, so:

```ts
expect(r.ingresosMesPrev).toBe(500);  // was 1200 — only 3 abr $500
expect(r.ventasMesPrev).toBe(1);      // was 2
expect(r.asistMesPrev).toBe(2);       // was 3 — 5 & 6 abr in, 30 abr out
```

**Augment** `"is all-zero for empty ledgers"`: also assert `ventasMesPrev === 0` and
`asistMesPrev === 0` (currently only `ingresosMesPrev` is asserted), so the no-baseline path stays
green under the new guard.

**Update** `"rolls the prior month across a year boundary"` — it *will* break under truncation
(`HOY = 15 Jan`; the `20 dic` venta and `31 dic` asistencia are now after the day-15 cutoff), and the
break is correct. Re-tune it into a **discriminating** case that proves the cutoff composes with the
year roll:

```ts
const enero = new Date(2026, 0, 15); // diaHoy = 15
const rr = calcularResumenMes(
  [v(2025, 11, 10, 100), v(2025, 11, 20, 900), v(2026, 0, 10, 100)],
  [a(2025, 11, 10), a(2025, 11, 31), a(2026, 0, 5)],
  enero,
);
expect(rr.ingresosMes).toBe(100);     // 10 ene
expect(rr.ingresosMesPrev).toBe(100); // only 10 dic (day 10 ≤ 15); 20 dic excluded
expect(rr.asistMes).toBe(1);          // 5 ene
expect(rr.asistMesPrev).toBe(1);      // only 10 dic; 31 dic excluded
```

**Add** `"on the 1st, compares against the prior month's day-1 slice (no full-month collapse)"`:

```ts
const primero = new Date(2026, 5, 1); // 1 Jun 2026, diaHoy = 1
const rr = calcularResumenMes(
  [v(2026, 5, 1, 400), v(2026, 4, 1, 300), v(2026, 4, 20, 900)],
  [],
  primero,
);
expect(rr.ingresosMes).toBe(400);
expect(rr.ingresosMesPrev).toBe(300); // only 1 may; 20 may excluded — NOT the old 1200-style collapse
```

**Add** `"short prior month is fully included at month-end (Mar 31 vs 28-day Feb)"`:

```ts
const finMarzo = new Date(2026, 2, 31); // 31 Mar 2026, diaHoy = 31
const rr = calcularResumenMes([v(2026, 1, 28, 700)], [], finMarzo); // 28 feb
expect(rr.ingresosMesPrev).toBe(700); // 28 ≤ 31 → whole short prior month counts, no clamp
```

Suite expectation: the existing `calcularResumenMes` count grows by the two added cases; full
`pnpm test` stays green.

## Edge cases (all handled by the single cutoff)

- **Month-length mismatch** (Mar 31 vs Feb): every prior-month row's day ≤ `diaHoy`, so the whole
  already-elapsed prior month is the slice — correct, no clamp.
- **Reverse mismatch** (Feb 28 vs 31-day Jan): the slice is Jan 1..28; Jan 29–31 are *intentionally*
  excluded (you have only lived 28 days). This is the correct same-elapsed-days semantic, asserted
  by an explicit test, not a clamp (clamp-to-month-length was rejected as gold-plating).
- **Year boundary** (Jan → Dec): `mesPrev` already rolls the year; the day cutoff is year-agnostic —
  pinned by the discriminating test above.
- **Empty ledger / first-ever month:** prior slice 0 → `prev === 0 && actual === 0` → `SIN MES ANT.`
- **Growth from zero:** `prev === 0 && actual > 0` → `↑ NUEVO` (the coupled fix).

## Deferred (verified, consciously out of Tier 1)

- **Future-dated rows inflate the `mes` headline** (finding #4, LOW). `mismoMes` ignores day-of-month,
  so a future-dated same-month row counts into the headline while the week series (offset ≥ 0) ignores
  it. Fix would add `difDias(fecha, hoy) >= 0` to the current-month buckets. Does not interact with the
  Tier 1 prior-slice math (prior-month rows are never "future"), so safe to defer.
- **`mesLabel` second clock read** (finding #5, LOW). `cuenta`/`inicio` pages call `hoyChihuahua()`
  again for the label, independent of the DAL's `hoy`; they can disagree in a sub-second window at the
  monthly midnight tick. Fix would single-source `hoy` per request.
- **Stale open tab at midnight / rollover** (finding #1, MEDIUM, **separate concern**). An RSC captures
  `hoy` once; a tab left open overnight shows a stale snapshot until navigation. This is client-freshness
  (a `router.refresh()` on focus/visibility comparing the server's `hoy` iso-day to the live one), not
  domain math — a distinct follow-up change.

(One audit item — "headline interaction" — was **refuted** by both verifiers as not-a-bug; it survives
only as the regression guard already covered by the unchanged headline assertions above.)

## Gate self-check

- **Elegance** ✓ — smallest change that fixes the root cause: one precomputed `diaHoy` + two one-line
  guards on branches that already exist, no new DTO fields, no DAL/query change, no projection
  machinery; month-length and year-boundary edges fall out of the cutoff for free. The only added
  surface — the `prev === 0` split — is forced by the design (without it the fix self-regresses), not
  decoration.
- **Senior Dev Approval** ✓ — textbook period-over-period (compare like-for-like elapsed periods),
  fully inside the pure tested rule; blast radius is exactly the 4 files that touch `*MesPrev`
  (never **inicio**); the label is corrected so the UI cannot overstate what it compares; the
  necessary behavior change to the year-boundary test is explicit and asserted, not an accidental
  regression.

## Files touched

- `src/domain/rules.ts` — `diaHoy` + two prior-month guards + doc bullet
- `src/domain/types.ts` — JSDoc on the three `*MesPrev` fields (no shape change)
- `src/domain/rules.test.ts` — rewrite prior-month case, augment empty-ledger, re-tune year-boundary, add day-1 + short-Feb cases
- `src/app/(app)/cuenta/_components/cuenta.tsx` — `DeltaCaption` relabel + `prev === 0` split
