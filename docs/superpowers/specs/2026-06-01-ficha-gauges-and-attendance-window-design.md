# Ficha: stacked-saldo gauges + rolling attendance window — design

**Date:** 2026-06-01
**Status:** Approved (brainstorm) → ready for implementation plan
**Scope:** Read/display layer only. **No** schema change, **no** write-rule change. Stays
ADR-0002 (derived-not-stored). The carry-forward stacking rule (`stackPaquete`, ADR-0004
stored balance) is confirmed correct and **unchanged**.

## Problem (surfaced during HITL testing of the Vercel-findings remediation)

Two things on the client ficha (`cliente-detalle.tsx`, fed by `getClienteFicha` → `shapeFicha`)
read as broken in a realistic multi-purchase / month-boundary scenario. Neither is a bug —
both are design choices that don't hold up once a client stacks packages or a month rolls over.

1. **Attendance history looks empty.** The ficha "HISTORIAL · JUN" is scoped to the **current
   calendar month** (`fecha >= first-of-month`). On the 1st it shows ~nothing even though the
   client attended all last month. Example: Aaron has active attendances on Jun 1, May 31, May
   30, May 29, May 1 — but the ficha shows only Jun 1, while the pase de lista (rolling ~104-day
   strip) shows the May days. Same data, two windows.
2. **Saldo gauge shows "23 / 8".** The gauge renders `remaining / totalClases`, where
   `totalClases` = the **latest package's** size (8). With carry-forward stacking the balance
   (23) spans multiple packages, so the single-package denominator is meaningless: ratio > 1,
   bar maxes out, "more remaining than the total." The días gauge has the same shape (`64 / 20`).
   (The earlier `scaleX` animation change is **not** the cause — old `width:%` and new `scaleX`
   both clamp identically under `overflow:hidden`.)

## Decisions (locked in brainstorm)

- Stacking is correct → **Issue 2 is display-only.**
- Attendance history → **rolling last 30 days** (not calendar month).
- Saldo gauges → **depletion bar anchored to the last purchase** ("full" = the moment they last
  bought; drains until the next purchase).
- Clases gauge label → **bar + "usadas X" caption + the big remaining number; no N/M fraction.**
- All visual/component work goes through the **frontend-design** skill at implementation
  ([[forge-use-frontend-design-skill]]).

## Part A — Attendance history: rolling 30-day window

- **DAL `getClienteFicha`** (`src/lib/data/clientes.ts`): change the asistencias fetch window
  from `.gte("fecha", monthStartIso(hoy))` to `.gte("fecha", <today − 30 days, iso>)` — still
  `.is("deleted_at", null)`, `.order("fecha", { ascending: false })`. (See Part B for widening
  this window slightly further when the last purchase predates it.)
- **`shapeFicha`** (`src/lib/data/derive.ts`): logic unchanged — it maps whatever asistencia
  rows it's handed. Today is still rendered separately (the leaf re-prepends the HOY row); the
  existing `a.fecha !== hoyIso` filter that prevents double-rendering today stays.
- **`cliente-detalle.tsx`**: replace the header `mesLabel` (`MON[parseDay(hoyIso).getMonth()]`)
  with the literal **"ÚLTIMOS 30 DÍAS"**; empty state copy → *"Sin asistencias en los últimos
  30 días."* The "N ASIST." count (`historial.length + (present ? 1 : 0)`) now reflects the
  rolling window — consistent with the new label.
- **No side effects:** the directory's per-client month count comes from `getClientesRoster`'s
  own this-month query (untouched); estado derivation (`derivarEstado`) does not read
  `asistEsteMes`, so widening the ficha's window cannot shift any estado/badge.
- **Window length** is a single constant (30) — easy to retune later.

## Part B — Stacked-saldo depletion gauges

Anchor both gauges to the last purchase: `lastPurchase = ventas[0]` (ventas are newest-first),
`lastPurchaseDate = fechaChihuahua(ventas[0].fecha)`.

### Días bar
- `denomDias = diasRestantes(parseDay(vence), lastPurchaseDate)` — total validity window granted
  at the last purchase (drains by calendar time).
- `fillDias = clamp(diasRest / denomDias, 0, 1)`.
- Big número = `diasRest` (yellow when `≤ 5`, as today). Caption = the `vence` date display.

### Clases bar
- `denomClases = clasesRest + attendedSincePurchase`, where `attendedSincePurchase` = count of
  asistencias with `consumio = true`, `deleted_at is null`, `fecha >= lastPurchaseDate`.
- `fillClases = clamp(clasesRest / denomClases, 0, 1)`.
- Big número = `clasesRest` (colored when low). Caption = **"usadas {attendedSincePurchase}"**.
- **Ilimitado** (`clasesRest === "ilimitado"`): show ∞, full bar, no "usadas" caption.

### Data sourcing (one fetch serves both Parts)
- Widen the ficha's asistencias fetch to `.gte("fecha", leastIso(today − 30d, lastPurchaseDate))`
  and add `consumio` to the select.
- Derive from that single result set:
  - the **Part A historial** = rows within the last 30 days;
  - `attendedSincePurchase` = rows with `consumio = true` and `fecha >= lastPurchaseDate`.
- This keeps it one query, no stored snapshot, fully derived.

### Edges / fallbacks
- **No `ventas`** (e.g. seeded clients with no purchase): no anchor → **hide both bars**, show
  just the números. (`ventas[0]` undefined → `lastPurchase == null`.)
- `denom <= 0` → clamp fill to its bounds (never divide-by-zero; never > 1).
- Expired/forfeited (`clasesRest === 0`) → empty clases bar, "usadas" reflects real count.
- A client whose last purchase predates the 30-day window: the widened fetch
  (`least(today−30d, lastPurchaseDate)`) guarantees `attendedSincePurchase` is exact.
- **Assumption to verify in impl:** `denomClases = clasesRest + attendedSincePurchase` holds iff
  each `consumio = true` attendance decremented `clases_restantes` by exactly 1 and nothing else
  mutates it between purchases. True in the current app (no manual saldo-edit path; cuenta editors
  are "próximamente"); confirm against `toggle_pase`'s `consumio`/decrement before relying on it.
  For an `ilimitado` client `consumio` is false (no decrement), which is why ilimitado skips the bar.

### Testability (per the codebase's testability-as-interface-depth lens)
- Put the two pure ratio computations in `derive.ts` as small pure functions (e.g.
  `gaugeFill(remaining, denom)` and the días/clases denominator helpers), and have `shapeFicha`
  return the fill ratios + captions in `FichaDerivada`. The `.tsx` only renders them — no math in
  the component. Unit-test the new pure functions in `derive.test.ts` (stacked balance, just-
  purchased ≈ full, partially-drained, ilimitado, no-ventas → null/hidden, denom ≤ 0).

## Files touched
- `src/lib/data/clientes.ts` — asistencias fetch window + `consumio` select.
- `src/lib/data/derive.ts` — `shapeFicha` returns gauge fills + captions; new pure helpers; the
  `FichaDerivada` interface gains the gauge fields; `attendedSincePurchase` derivation.
- `src/lib/data/derive.test.ts` — unit tests for the new pure gauge helpers.
- `src/app/(app)/clientes/[id]/_components/cliente-detalle.tsx` — render the new bars/captions +
  the "ÚLTIMOS 30 DÍAS" header/empty-state (via frontend-design).

## Out of scope
- Any change to stacking / `stackPaquete` / the stored running balance (confirmed correct).
- Schema changes / stored snapshots.
- The directory screen, the pase de lista, and resumen (untouched).

## Verification
- `derive.test.ts` covers the pure gauge/denominator math.
- Full gate green (lint + typecheck + test + build).
- HITL visual smoke: seed one client who **bought ~3 weeks ago and attended since** so a bar
  shows genuinely drained (Aaron, who bought today, will read ≈ full — correct but undramatic).
  Open Diana/Bruno/Zaira to re-confirm the ≤5-días yellow still holds.
