# Forge — Mock → Real Migration Backlog

> **STATUS: COMPLETE (2026-05-31).** All slices below shipped — Forge runs on
> real Supabase. Kept as the historical migration record. The live architecture
> map is `ARCHITECTURE.md` and the glossary is `CONTEXT.md`; references below
> describe the mock era and may name modules since deleted (e.g.
> `src/lib/data/types.ts`, `seed.ts`).

The sequenced work to make Forge functional on Supabase. Feeds `/to-prd →
/to-issues → /to-goal`. Dependency order: **domain core first** (done — it is
pure and tested), then per sector. Wiring the tested `src/domain` rules into
screens happens here, through the DAL.

## Mock-isms to replace
| Artifact | Location | Replace with |
|---|---|---|
| Stored `estado`/`inicial`/`vence`/`asistEsteMes` | `lib/data/types.ts`, `seed.ts` | derived via `derivarEstado` / `calcVigenciaEnd` at read |
| `VIG_END` magic end-dates | `(app)/vender/_components/vender.tsx` | `calcVigenciaEnd` |
| `setTimeout(700)` fake sale + random folio | `(app)/vender/_components/vender.tsx` | real `crearVenta` Server Action; DB folio |
| `HOY` hardcoded metrics | `seed.ts` | `calcularResumenMes` over real ventas + asistencias |
| `HISTORIAL` / `PAGOS` inline arrays | `(app)/clientes/[id]/_components/cliente-detalle.tsx` | queries by `cliente_id` |
| `recientes` hardcoded list | `(app)/inicio/_components/inicio.tsx` | query: today's attendance |
| `PASE_SEED` / `ASIST_TIMES_SEED` + offset grid | `seed.ts`, `lib/date.ts` | `asistencia` rows with absolute Chihuahua-local dates |
| "Forge Bootcamp" string (~5 spots) | layout metadata, recibo, WA body, seed | "FORGE", stored once |

## Per-sector slices (tracer bullets: schema → DAL → action → screen)
1. **domain/** — DONE. Pure rules implemented + tested. Everything below wires these in.
2. **ventas** — Server Action calls `stackPaquete`, persists the `venta`, mutates
   the cliente (classes+days stacked), DB folio, then `updateTag('clientes','max')`. Receipt rendering stays.
3. **asistencia** — `togglePase` → Server Action inserting/soft-deleting an
   `asistencia` row (absolute date) + calling `consumirClase`. Bulk back-entry supported.
4. **clientes** — `estado`/`vence`/`diasRest`/`asistEsteMes` derived at read via the
   DAL calling domain rules; `HISTORIAL`/`PAGOS` → queries; reactivation keeps history.
5. **retencion** — `SEED_PLANTILLAS` → `plantilla` table; `renderPlantilla` substitutes
   real tokens; `waLink` prefixes `+52`.
6. **cuenta** — `HOY` → `calcularResumenMes`; sub-editors stay "próximamente" stubs.

## Prerequisites (next cycle, before slice 2)
- Install `@supabase/ssr` + `@supabase/supabase-js`; create `src/lib/supabase/{client,server}.ts`.
- Design the schema (clientes, paquetes, ventas, asistencias, plantillas, cobro, perfil) with RLS. `clientes` stores optional `email` + `birthday` (brief Q4); phone is required (the WhatsApp spine). See the design spec §8 (field reconciliations) and §11 (full Next 16 + Supabase API notes: `updateTag`, async request APIs, `@supabase/ssr` `getAll`/`setAll`, etc.).
- Add `proxy.ts` session refresh + a single-operator login.
