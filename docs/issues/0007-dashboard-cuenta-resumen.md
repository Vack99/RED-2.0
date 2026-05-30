# Issue 7 — Dashboard + cuenta resumen on real data (calcularResumenMes)

> **Source:** docs/prds/prd-supabase-migration.md · **Type:** AFK · **Labels:** `ready-for-agent`
>
> **Status:** ✅ Done @7aaaa8a — gates green; both fresh-eyes gates YES (Elegance + Senior Dev;
> a dead `{datos_pago}` formatter flagged on round 1 was removed). Note: `{datos_pago}` is
> *sourced* from the real cobro row and read behind auth; injecting the token into a sent
> message body lands with the retención editor (renderPlantilla already supports the token).

## What to build

Replace every frozen metric with real aggregates. Add a **new pure domain rule**
`calcularResumenMes` (unit-tested) that aggregates **ventas** + **asistencias** for a
period into ingresos/ventas/asist counts, hoy-vs-ayer, a weekly series, and
period-over-period deltas. Wire the **inicio** dashboard (asistencias hoy/ayer,
vigentes, ingresos, sparkline, today's recientes joined to clientes) and the **cuenta**
"Resumen del mes" to compute from real data. Add the `cobro` table for the
`{datos_pago}` token. Sub-editors stay "próximamente" but display real data.

## Acceptance criteria

- [x] `calcularResumenMes` added to the domain core and **unit-tested** (8 cases: fixed ventas/asistencias + fixed `hoy` → ingresosMes/ventasMes/asistMes/hoy-vs-ayer/last-7-day/weekly series/prior-month deltas + year-boundary + empty-ledger); `ResumenMes` type added.
- [x] **inicio** renders asistencias hoy + delta vs ayer, vigentes, ingresos, and a sparkline from a real 7-day series; "recientes" = today's asistencia rows joined to clientes, ordered by time.
- [x] **cuenta** "Resumen del mes" reflects real ventas + asistencias incl. the prior-period delta; the month label is real (es-MX).
- [x] `cobro` table created with RLS; `{datos_pago}` sourced from the real cobro row; perfil/cobro read behind auth.
- [x] The `HOY` seed object + hardcoded sparkline/deltas are removed from the wired screens.
- [x] Sub-editors remain "próximamente" but show real data.
- [x] `pnpm lint` + `pnpm test` (45/45) + `pnpm build` green.

## Blocked by

#3 — ingresos/ventas come from ventas.
#4 — asistMes/hoy-ayer come from asistencias.
