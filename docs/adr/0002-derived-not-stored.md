# ADR-0002 — Derived, not stored

**Status:** Accepted — 2026-05-29

## Context
The cloned mock stores `estado`, `vence`, `diasRest`, `asistEsteMes`, and
`inicial` as fields on the client record. These are projections of other
facts; storing them guarantees drift the moment any mutation happens (the
mock already patches `asistEsteMes + (asistHoy ? 1 : 0)` by hand).

## Decision
Persist only **stored facts** (id, nombre, tel, optional email/birthday,
purchase history, attendance rows). Compute **`estado`, `vence`, `diasRest`,
`asistEsteMes`, `inicial`** at read time via `src/domain` rules
(`derivarEstado`, `calcVigenciaEnd`, `diasRestantes`).

## Consequences
- One source of truth per projection; no dual-write bugs.
- The seed's stored projection fields are mock-only and are removed when the
  Supabase schema lands (see `docs/MIGRATION.md`).
- `src/domain/rules.ts` is the single home for these derivations and is unit-tested.
