# Forge migration — issue queue (local)

> No issue tracker / git remote (local-only, by decision 2026-05-29). These markdown
> files **are** the issue store; `/to-goal` consumes them directly. Source PRD:
> `docs/prds/prd-supabase-migration.md`.

> **Progress (2026-05-30): ALL 8 SLICES SHIPPED ✅** — #1 · #2 · #3 · #4 (@ `9a597c3`) · #5 (@ `0b99c0b`) ·
> #6 (@ `4ada644`) · #7 (@ `7aaaa8a`) · #8 (@ `48f4de9`). The mock → Supabase migration is **complete**
> on `feat/supabase-infra-perfil`, then verified in-browser and merged into `master` (2026-05-31; phone auto-advance bug fixed @7181773).

**Labels:** `ready-for-agent` = AFK, eligible for the autonomous `/to-goal` queue ·
`hitl` = human-gated (`/to-goal` skips it and treats it as a non-closeable blocker).

Issue number `#N` ↔ file `000N-*.md`. "Blocked by" lines reference `#N`.

| # | File | Title | Type | Label | Blocked by |
|---|------|-------|------|-------|-----------|
| 1 | ✅ `0001-infra-supabase-clients-perfil-schema.md` | Infra: Supabase clients, perfil schema + RLS **(done @186f7b4)** | AFK | `ready-for-agent` | — |
| 2 | ✅ `0002-auth-login-perfil-read.md` | Auth: single-operator login + first authed read **(done @f7b823f)** | **HITL** | `hitl` | #1 |
| 3 | ✅ `0003-ventas-tracer-bullet.md` | Ventas tracer bullet **(done @e26f624)** | AFK | `ready-for-agent` | #2 |
| 4 | ✅ `0004-asistencia-pase-de-lista.md` | Asistencia (pase de lista) **(done @9a597c3)** | AFK | `ready-for-agent` | #3 |
| 5 | ✅ `0005-clientes-roster-ficha.md` | Clientes roster + ficha (derived-at-read) **(done @0b99c0b)** | AFK | `ready-for-agent` | #3, #4 |
| 6 | ✅ `0006-retencion-plantillas.md` | Retención: plantillas + converge WA builders **(done @4ada644)** | AFK | `ready-for-agent` | #3, #5 |
| 7 | ✅ `0007-dashboard-cuenta-resumen.md` | Dashboard + cuenta resumen (calcularResumenMes) **(done @7aaaa8a)** | AFK | `ready-for-agent` | #3, #4 |
| 8 | ✅ `0008-retire-mock-seam.md` | Retire mock seam + tighten boundary **(done @48f4de9)** | AFK | `ready-for-agent` | #3, #4, #5, #6, #7 |

## Execution order

```
#1 ──▶ #2 (HITL gate) ──▶ #3 ──┬──▶ #4 ──┬──▶ #5 ──▶ #6 ──┐
                               │         │               ├──▶ #8
                               └──▶ #7 ◀─┘               ┘
```

`#1` → `#2` (human provisions auth/env) → `#3` (ventas). After `#3`: `#4`. After
`#3`+`#4`: `#5` and `#7` can run in parallel. `#6` after `#5`. `#8` last (closes out
the mock seam once #3–#7 are done).
