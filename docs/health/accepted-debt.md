# Accepted data-fetch debt — forge-1.0

Schema: `~/.claude/skills/to-health/accepted-debt-schema.md`. Seeded 2026-06-05 from the
2026-06-02 query-perf audit (the 1 HIGH was fixed in d958423 and is intentionally absent here).
The health gate treats each as 🟢 ACCEPTED until its trigger is crossed.

### L-001 — getClientesLite over-reads (client-picker)
- disease: read-amplification
- detector: D2
- location: src/lib/data/clientes.ts (getClientesLite)
- accepted: 2026-06-02
- rationale: full roster, naturally small for one gym
- trigger: table:clientes op:> threshold:2000

### L-002 — getClientesParaPase over-reads (pase-de-lista)
- disease: read-amplification
- detector: D2
- location: src/lib/data/clientes.ts (getClientesParaPase)
- accepted: 2026-06-02
- rationale: full roster, small
- trigger: table:clientes op:> threshold:2000

### L-003 — getClientesRoster directory leg over-reads
- disease: read-amplification
- detector: D2
- location: src/lib/data/clientes.ts (getClientesRoster)
- accepted: 2026-06-02
- rationale: full roster
- trigger: table:clientes op:> threshold:2000

### L-004 — getRosterResumen aggregates whole roster in JS
- disease: read-amplification
- detector: D2
- location: src/lib/data/clientes.ts (getRosterResumen)
- accepted: 2026-06-02
- rationale: pulls every client row to compute 2 scalar counts; cheap at gym scale. Push-to-DB candidate (count RPC/view).
- trigger: table:clientes op:> threshold:800

### L-005 — getClienteFicha per-client purchases unbounded
- disease: read-amplification
- detector: D2
- location: src/lib/data/clientes.ts (getClienteFicha — ventas leg)
- accepted: 2026-06-02
- rationale: bounded per client (.eq(cliente_id))
- trigger: manual:a single client exceeds ~1000 lifetime purchases

### L-006 — getClienteFicha per-client attendance window
- disease: read-amplification
- detector: D2
- location: src/lib/data/clientes.ts (getClienteFicha — asistencias leg)
- accepted: 2026-06-02
- rationale: per-client 30-day window
- trigger: manual:a single client exceeds ~1000 attendances in 30d

### L-007 — getResumenMes SUM(monto) over rows
- disease: read-amplification
- detector: D2
- location: src/lib/data/resumen.ts (getResumenMes — ventas leg)
- accepted: 2026-06-02
- rationale: 2-month window aggregated in JS; push-to-DB candidate (SUM in SQL)
- trigger: table:ventas op:> threshold:5000

### L-008 — getResumenMes attendance count over rows
- disease: read-amplification
- detector: D2
- location: src/lib/data/resumen.ts (getResumenMes — asistencias leg)
- accepted: 2026-06-02
- rationale: 2-month window counted in JS; push-to-DB candidate
- trigger: table:asistencias op:> threshold:20000
