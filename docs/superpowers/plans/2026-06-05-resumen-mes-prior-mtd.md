# Resumen del Mes — prior-month-to-date delta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `Resumen del Mes` delta compare month-to-date against the *same elapsed slice* of the prior month (prior-month-to-date), so it reads honestly at every point in the month instead of showing a false "−97%" at rollover.

**Architecture:** Two surgical changes. (1) In the pure domain rule `calcularResumenMes`, add a same-day-of-month cutoff (`fecha.getDate() <= diaHoy`) to the two prior-month accumulation branches — this truncates the `*MesPrev` baseline to the same elapsed days as the current month-to-date. The headline totals and the DAL are untouched; the rule stays pure. (2) In `DeltaCaption`, relabel `VS MES ANT.` → `VS PERIODO ANT.` and split the `prev === 0` path into `↑ NUEVO` (growth from zero) vs `SIN MES ANT.` (genuinely no baseline) — the coupled piece that prevents the truncation from regressing early-month captions to a false "no data".

**Tech Stack:** TypeScript, Vitest (`pnpm test` = `vitest run`), Next.js (App Router), ESLint + dependency-cruiser (`pnpm lint`), `tsc --noEmit` (`pnpm typecheck`). No app-component unit-test harness exists — tests live only in `src/domain` + `src/lib`.

**Spec:** `docs/superpowers/specs/2026-06-05-resumen-mes-comparison-design.md` (Tier 1, caption `VS PERIODO ANT.`).

**Pre-flight:** Work on the current `worktree-b` branch (this worktree's normal workflow) or cut a `fix/resumen-mes-prior-mtd` branch first — your choice. The pre-commit hook runs `pnpm lint`; expect it to fire on each commit.

---

### Task 1: Truncate the prior baseline to prior-month-to-date (pure rule, TDD)

**Files:**
- Modify: `src/domain/rules.ts` (function `calcularResumenMes`, lines ~211–245, and its doc comment lines 198–200)
- Modify: `src/domain/types.ts` (the three `*MesPrev` field docs, lines ~85–88)
- Test: `src/domain/rules.test.ts` (the `calcularResumenMes` describe block, lines ~220–326)

- [ ] **Step 1: Write/adjust the failing tests**

In `src/domain/rules.test.ts`, **rewrite** the existing `"totals the PRIOR calendar month for period-over-period deltas"` test (currently lines ~279–283) to the truncated semantics and rename it:

```ts
it("totals the prior month through the same day-of-month (prior-month-to-date)", () => {
  // HOY = 27 May, diaHoy = 27 → April slice is 1..27 abr.
  expect(r.ingresosMesPrev).toBe(500); // only 3 abr $500; 28 abr (day 28 > 27) excluded
  expect(r.ventasMesPrev).toBe(1);     // was 2
  expect(r.asistMesPrev).toBe(2);      // 5 & 6 abr in; 30 abr (day 30 > 27) excluded — was 3
});
```

**Augment** the `"is all-zero for empty ledgers"` test (currently lines ~302–312) — add two assertions inside it so the no-baseline path is pinned under the new guard:

```ts
expect(empty.ventasMesPrev).toBe(0);
expect(empty.asistMesPrev).toBe(0);
```

**Replace** the `"rolls the prior month across a year boundary (Jan hoy → Dec prev)"` test (currently lines ~314–325) with this discriminating version (it must change — under truncation the 20 dic / 31 dic rows fall after the day-15 cutoff):

```ts
it("rolls the prior month across a year boundary with the day-of-month cutoff (Jan hoy → Dec prev)", () => {
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
});
```

**Add** these two new tests at the end of the `calcularResumenMes` describe block (before its closing `});` at line ~326):

```ts
it("on the 1st, compares against the prior month's day-1 slice (no full-month collapse)", () => {
  const primero = new Date(2026, 5, 1); // 1 Jun 2026, diaHoy = 1
  const rr = calcularResumenMes(
    [v(2026, 5, 1, 400), v(2026, 4, 1, 300), v(2026, 4, 20, 900)],
    [],
    primero,
  );
  expect(rr.ingresosMes).toBe(400);
  expect(rr.ingresosMesPrev).toBe(300); // only 1 may; 20 may (day 20 > 1) excluded
});

it("includes the whole short prior month at month-end (Mar 31 vs 28-day Feb)", () => {
  const finMarzo = new Date(2026, 2, 31); // 31 Mar 2026, diaHoy = 31
  const rr = calcularResumenMes([v(2026, 1, 28, 700)], [], finMarzo); // 28 feb
  expect(rr.ingresosMesPrev).toBe(700); // 28 ≤ 31 → counted, no clamp
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/domain/rules.test.ts`
Expected: FAIL. The prior-month case fails (`ingresosMesPrev` is 1200, expected 500), the year-boundary case fails (`ingresosMesPrev` 900 vs 100; `asistMesPrev` 1 vs ... — current full-month logic), and the new day-1 / short-Feb cases fail — because the rule still counts the **full** prior month. (The empty-ledger augment already passes.)

- [ ] **Step 3: Implement the truncation in `calcularResumenMes`**

In `src/domain/rules.ts`, add `diaHoy` right after the `ayer` declaration (line 212):

```ts
  const mesPrev = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);
  const diaHoy = hoy.getDate(); // prior-month-to-date cutoff: same elapsed day-of-month
```

Change the **ventas** prior-month branch (lines 224–227) to add the cutoff:

```ts
    } else if (mismoMes(venta.fecha, mesPrev) && venta.fecha.getDate() <= diaHoy) {
      ingresosMesPrev += venta.monto;
      ventasMesPrev += 1;
    }
```

Change the **asistencias** prior-month branch (the `else if (mismoMes(asis.fecha, mesPrev)) asistMesPrev += 1;` line, ~241) to add the cutoff:

```ts
    else if (mismoMes(asis.fecha, mesPrev) && asis.fecha.getDate() <= diaHoy) asistMesPrev += 1;
```

Leave everything else — the `mismoMes(_, hoy)` headline branches, hoy/ayer, `ingresosSemana`, `asistenciasSemana` — exactly as-is.

- [ ] **Step 4: Update the docstrings (non-behavioral)**

In `src/domain/rules.ts`, replace the `*Mes / *MesPrev` bullet in the function doc (lines 198–200):

```ts
 *  - *Mes: the current CALENDAR month-to-date.
 *  - *MesPrev: the prior CALENDAR month THROUGH the same day-of-month as hoy
 *    (prior-month-to-date — equal elapsed slice, so the delta is like-for-like;
 *    prior rolls across a year boundary, e.g. Jan hoy → Dec prev).
```

In `src/domain/types.ts`, replace the comment above the three `*MesPrev` fields (line 85) so the now-different semantics are self-documenting:

```ts
  /** Same three totals for the prior calendar month THROUGH the same day-of-month
   *  as hoy (prior-month-to-date) — equal elapsed slice, so the delta compares
   *  like-for-like from day 1. */
  ingresosMesPrev: number;
  ventasMesPrev: number;
  asistMesPrev: number;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test src/domain/rules.test.ts`
Expected: PASS — all `calcularResumenMes` cases green, including the unchanged headline assertions (`ingresosMes` 1950, `ventasMes` 4, `asistMes` 9, `ingresosSemana` 1550, the weekly series) which prove the headline did not move.

- [ ] **Step 6: Commit**

```bash
git add src/domain/rules.ts src/domain/types.ts src/domain/rules.test.ts
git commit -m "fix(resumen): compare delta vs prior-month-to-date, not full prior month"
```

---

### Task 2: Caption — relabel + up-from-zero split

**Files:**
- Modify: `src/app/(app)/cuenta/_components/cuenta.tsx` (`DeltaCaption`, lines ~50–66; `deltaPct` at 44–47 is unchanged)

> No automated unit test: there is no app-component test harness in this repo (tests live only in `src/domain` + `src/lib`), and the spec deliberately keeps this 3-branch presentation decision inline rather than extracting a tested helper (YAGNI). The risk-bearing precondition — that `*MesPrev` becomes 0 early in the month — is already covered by the day-1 test in Task 1. This task is verified by `pnpm typecheck` + `pnpm build` + a manual three-state check.

- [ ] **Step 1: Edit `DeltaCaption`**

Replace the body of `DeltaCaption` (lines ~50–66) with:

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

(`deltaPct` is unchanged — it still returns `null` when `prev === 0`.)

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck`
Expected: PASS (no type errors).

Run: `pnpm lint`
Expected: PASS (ESLint clean; dependency-cruiser boundary intact — this change does not cross sectors).

- [ ] **Step 3: Manual three-state check**

Start the app (`pnpm dev`) and open `/cuenta`, or reason through the props the card passes (`actual={ingresosMes} prev={ingresosMesPrev}`, and likewise ventas/asist):
- `prev > 0` → `+18% VS PERIODO ANT.` (green if up, gold if down, muted if 0%).
- `prev === 0 && actual > 0` → green `↑ NUEVO`.
- `prev === 0 && actual === 0` → muted `SIN MES ANT.`

Confirm no metric still renders the old `VS MES ANT.` text anywhere.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/cuenta/_components/cuenta.tsx"
git commit -m "fix(cuenta): relabel delta to VS PERIODO ANT. + show NUEVO for growth-from-zero"
```

---

### Task 3: Full-suite gate

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS — entire Vitest suite green (the `calcularResumenMes` block grew by 2 cases; nothing else changed).

- [ ] **Step 2: Lint (sector boundary) + typecheck**

Run: `pnpm lint`
Expected: PASS.

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Production build**

Run: `pnpm build`
Expected: PASS — `next build` completes with no type or build errors.

- [ ] **Step 4 (optional): final commit if anything was left uncommitted**

```bash
git status   # expect clean; if not, review and commit deliberately
```

---

## Deferred (NOT in this plan — documented in the spec, do not implement here)

- Future-dated rows inflating the `mes` headline (`difDias(fecha, hoy) >= 0` guard) — LOW.
- `mesLabel` second-clock-read seam (single-source `hoy` per request) — LOW.
- Stale open tab not refreshing at midnight / rollover (`router.refresh()` on focus) — MEDIUM, separate client concern.

## Notes on correctness (for the implementing engineer)

- The cutoff `fecha.getDate() <= diaHoy` is the *only* new logic. It auto-handles month-length mismatch: when `diaHoy` exceeds the prior month's length (e.g. hoy = Mar 31, Feb maxes at 28), every prior-month row passes, so the slice is the whole already-elapsed prior month — correct, no clamp needed.
- The Feb-28-vs-31-day-January direction *intentionally* excludes Jan 29–31 (you have only lived 28 days). This is the correct same-elapsed-days semantic, not a bug — do not "fix" it with a clamp.
- Do not touch the headline branches (`mismoMes(_, hoy)`); the unchanged headline assertions in Task 1 are the regression guard.
