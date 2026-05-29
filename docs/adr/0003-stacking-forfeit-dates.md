# ADR-0003 — Stacking, forfeit & the date model

**Status:** Accepted — 2026-05-29

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
