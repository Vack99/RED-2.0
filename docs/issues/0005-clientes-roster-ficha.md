# Issue 5 — Clientes roster + ficha (derived-at-read)

> **Source:** docs/prds/prd-supabase-migration.md · **Type:** AFK · **Labels:** `ready-for-agent`

## What to build

Make the roster and the **ficha** reflect real, derived data. A **pure DAL row→DTO
derivation layer** (unit-tested without Supabase) turns stored cliente facts +
attendance/venta rows + a passed-in `hoy` into a DTO with `estado` / `vence` /
`diasRest` / **clases restantes** / `asistEsteMes` / `inicial` (forfeit applied lazily
at read). The roster reads these derived values for filter/sort/counts; the ficha shows
real **HISTORIAL** (asistencia by cliente_id, this month), real **PAGOS** (ventas by
cliente_id), real COMPRADO/ALTA dates, the mensaje rendered via `renderPlantilla`, and
reactivation that keeps history. Add optional email/birthday columns (phone stays
required — the WhatsApp spine).

## Acceptance criteria

- [ ] Pure row→DTO derivation functions exist and are **unit-tested** (fixed rows + fixed `hoy` → asserted estado/vence/diasRest/clasesRest/asistEsteMes/inicial incl. forfeit-on-read); no Supabase needed for those tests. Prior art: `src/domain/rules.test.ts`.
- [ ] Roster renders real clientes with derived `estado`/`diasRest`; search by nombre/tel + facet filters (días/clases) + sort (dias/nombre/asist) operate on derived values; vigentes/renovar counts derived.
- [ ] Ficha HISTORIAL = asistencia rows by cliente_id (current month, desc); the `N ASIST.` count is derived from result length.
- [ ] Ficha PAGOS = ventas rows by cliente_id; the `N VENTAS` count is derived.
- [ ] COMPRADO/ALTA dates come from the active venta + cliente `created_at`; no hardcoded dates.
- [ ] Optional `email` + `birthday` columns added (migration); `tel` remains required (NOT NULL).
- [ ] Reactivating a lapsed cliente preserves history (no row deletion).
- [ ] mensaje (recordatorio) rendered via `renderPlantilla` + `waLink` (+52); no inline `"Forge Bootcamp"` string remains.
- [ ] `pnpm lint` + `pnpm test` + `pnpm build` green.

## Blocked by

#3 — needs clientes + ventas (PAGOS, saldo).
#4 — needs asistencia rows (HISTORIAL, asistEsteMes).
