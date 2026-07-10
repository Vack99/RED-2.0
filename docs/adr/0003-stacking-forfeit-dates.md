# ADR-0003 — Stacking, forfeit & the date model

**Status:** Accepted — 2026-05-29 · **Amended:** 2026-07-10 (rulings C1 flat-30 `mes`, C4 purchase-wins, C9 vence-day-valid; see Amendment below)

## Context
The brief answers several domain questions (Q1, Q2, Q3, Q5, Q6) that define how
packages and attendance behave. The mock implements none of them and models
attendance as integer offsets from a hardcoded `DEMO_TODAY`, which cannot
represent arbitrary past dates — breaking the brief's "enter a week at once" need.

## Decision
- **Stacking (Q5):** buying a package early **adds** its classes and days onto
  the current package (additive, not a re-based window). `stackPaquete`.
- **Forfeit (Q2):** when the vigencia expires, remaining classes are forfeited.
  `forfeit`.
- **Classes-out (Q3):** reaching 0 classes ends the package (`sin_clases`).
- **Same-day duplicates (Q6):** allowed; each attendance consumes a class.
  `consumirClase`.
- **Ilimitado vigencia (Q1):** runs to the **end of the purchase calendar
  month**. `calcVigenciaEnd(date, "mes")`.
- **Date model:** attendance is stored as **absolute America/Chihuahua calendar
  dates** (one row per attendance), never offsets.

## Consequences
- These rules live in `src/domain/rules.ts`, unit-tested against the brief's
  worked examples.
- At migration, the absolute-date model replaces `VIG_END` and the
  offset-keyed `PaseGrid`, and unblocks bulk back-entry.

## Amendment — 2026-07-10 (renewal-flow rulings C1, C4, C9)

Three of the original decisions are overturned by the owner rulings in `docs/FIndings/2026-07-08-renewal-flow-findings.md`. Additive stacking and forfeit-on-expiry (Q5/Q2) stand; the *switch rule*, the *`mes` vigencia*, and the *vence-day boundary* change. Live in `rules.ts` (Task-1 state) and pinned by `supabase/tests/registrar_venta_stacking.sql`.

- **C1 — `mes` is a flat 30 days**, replacing "end of the purchase calendar month". Fresh purchase = `hoy + 30`; renewal = `current vence + 30`. `calcVigenciaEnd(date, "mes")` and the paquete "Hasta" hint change with it. The month-end model punished the early/on-time renewer on the common path (a `vence`-day `mes` renewal expired same-day for full price).
- **C4 — purchase wins, days carry**, replacing "ilimitado wins" (the old sticky-ilimitado rule). The purchased package's *type* takes effect immediately: ilimitado→finite gives the new pack's class count (not a retained unlimited); finite→ilimitado becomes unlimited. Remaining paid days carry and stack in every case; classes add only when both sides are finite.
- **C9 — the vence day is a full training day.** "Vence 30 jun" means June 30 is bookable, attendable, and a same-day renewal *carries* leftovers — forfeit starts the day after. The renewal/read forfeit check moves from `dias <= 0` to `dias < 0`; booking already matched; attendance gains the same inclusive check.
