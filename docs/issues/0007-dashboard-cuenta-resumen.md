# Issue 7 — Dashboard + cuenta resumen on real data (calcularResumenMes)

> **Source:** docs/prds/prd-supabase-migration.md · **Type:** AFK · **Labels:** `ready-for-agent`

## What to build

Replace every frozen metric with real aggregates. Add a **new pure domain rule**
`calcularResumenMes` (unit-tested) that aggregates **ventas** + **asistencias** for a
period into ingresos/ventas/asist counts, hoy-vs-ayer, a weekly series, and
period-over-period deltas. Wire the **inicio** dashboard (asistencias hoy/ayer,
vigentes, ingresos, sparkline, today's recientes joined to clientes) and the **cuenta**
"Resumen del mes" to compute from real data. Add the `cobro` table for the
`{datos_pago}` token. Sub-editors stay "próximamente" but display real data.

## Acceptance criteria

- [ ] `calcularResumenMes` added to the domain core and **unit-tested** (fixed ventas/asistencias + fixed `hoy` → asserted ingresosMes/ventasMes/asistMes/hoy-vs-ayer/deltas); `ResumenMes` type added. Prior art: `src/domain/rules.test.ts`.
- [ ] **inicio** renders asistencias hoy + delta vs ayer, vigentes, ingresos, and a sparkline from a real series; "recientes" = today's asistencia rows joined to clientes, ordered by time.
- [ ] **cuenta** "Resumen del mes" reflects real ventas + asistencias incl. the prior-period delta; the month label is real.
- [ ] `cobro` table created with RLS; `{datos_pago}` sourced from the real cobro row; perfil/cobro read behind auth.
- [ ] The `HOY` seed object + hardcoded sparkline/deltas are removed from the wired screens.
- [ ] Sub-editors remain "próximamente" but show real data.
- [ ] `pnpm lint` + `pnpm test` + `pnpm build` green.

## Blocked by

#3 — ingresos/ventas come from ventas.
#4 — asistMes/hoy-ayer come from asistencias.
