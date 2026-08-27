# ADR-0003 — Stacking, forfeit & the date model

**Status:** Accepted — 2026-05-29 · **Amended:** 2026-07-10 (rulings C1 flat-30 `mes`, C4 purchase-wins, C9 vence-day-valid) · **Amended:** 2026-08-26 (**renewal is a full reset** — Q5 stacking, C4's day-carry and C9's leftover-carry are SUPERSEDED; see the second Amendment below)

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

## Amendment — 2026-08-26 (owner ruling: renewal is a FULL RESET, both axes)

**Q5 (additive stacking) is SUPERSEDED**, and with it the *day-carry* half of C4 and the
*leftover-carry* half of C9. A sale now grants exactly what was bought, for an existing cliente
exactly as for a brand-new one:

```
clases_restantes = the pack's clases      (NULL when the pack is ilimitado)
vence            = the sale's effective start + the pack's days
```

Nothing carries. Buying early no longer adds days or classes — it **replaces** them, and the new
`vence` may therefore land EARLIER than the old one.

**Evidence behind the ruling.** Three independent lines, all pointing the same way:

- `docs/research/2026-08-26-class-pack-renewal-standard.md` — the market scan: no comparable
  platform defaults to stack-and-restart. Forfeit-on-renewal is the norm, and our additive model was
  a house invention rather than an industry convention we had matched.
- The forge owner's own words — *"classes are not supposed to overlap"* — i.e. the one real operator
  (`owner-is-dev-not-operator`) had never wanted the behaviour the code implemented.
- `docs/audits/2026-08-26-reset-sweep-report.md` — the prod sweep. The live rows were corrected to
  reset math by hand on 2026-08-26; without this change the next renewal would have re-created the
  carry they were corrected out of. The migration is what makes the correction hold.

**What still stands from the original decision and the first amendment:** forfeit-on-expiry (Q2),
classes-out (Q3), same-day duplicates (Q6), the absolute-date model, C1's flat-30 `mes`, and the
*type* half of C4 (the purchased package's type takes effect immediately — ilimitado→finite gives
the new pack's count, finite→ilimitado becomes unlimited). C9's "the vence day is a full training
day" also stands **for booking and attendance**; what it no longer does is carry leftovers into a
same-day renewal, because no renewal carries anything now.

**Consequence for the code.** The rule lives in exactly one place — the RPC. `registrar_venta`
(`20260826120200_registrar_venta_reset.sql`) pins both bases to 0 on every path; the derivation below
that is unchanged. The `stackPaquete` / `baseParaStack` TS helpers that used to hold the ruling were
DELETED in the same change: they had no production caller (the RPC has owned this math since
ADR-0005's re-derivation), so keeping them would have left a tested, importable description of a rule
the database no longer follows. Pinned by written-row vectors in
`supabase/tests/registrar_venta_stacking.sql` (V16 the reset on both axes, V17 ilimitado→finite),
with the carry expectations across that file plus `registrar_venta_backdate.sql` and
`registrar_venta_personalizado.sql` re-derived to match.

**Known edge, accepted.** Without carried days, `registrar_venta`'s dead-on-arrival bound (E2,
`v_new_vence < v_hoy` → 'La venta ya estaría vencida en la fecha de inicio') can refuse a sale it
used to accept: a backdate near the 30-day floor with a short package now expires before today. That
refusal is correct under this ruling — the sale really would be recorded already-expired — and the
desk's answer is a nearer start date.

**Not covered by this amendment:** `editar_venta` / `editar_venta_paquete` still re-derive an EDIT of
an existing sale with the old stacking arithmetic. Whether a *correction door* should also reset is a
separate ruling the owner has not made.
