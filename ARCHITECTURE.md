# Forge — Architecture Map

**Read this first.** Forge is a single-operator gym admin app (es-MX). The
folders below scream the domain; this page is the map.

## You are here → start reading
1. `CONTEXT.md` — the vocabulary.
2. `src/domain/` — the business rules (pure, tested). How the gym works.
3. `src/app/(app)/` — the screens, one folder per sector.
4. `src/lib/data/` — the data seam (Supabase via a `server-only` DAL; ADR-0001).
5. `docs/adr/` — why the structure is the way it is.

## Sectors
| Sector | Folder | Job | May import |
|---|---|---|---|
| inicio | `src/app/(app)/inicio` | Dashboard / home metrics | domain, lib, components |
| asistencia | `src/app/(app)/asistencia` | Pase de lista (attendance) | domain, lib, components |
| clientes | `src/app/(app)/clientes` | Roster + ficha (detail) | domain, lib, components |
| vender | `src/app/(app)/vender` | Venta + recibo (sell/renew) | domain, lib, components |
| cuenta | `src/app/(app)/cuenta` | Perfil + ajustes | domain, lib, components |
| **domain core** | `src/domain` | Business rules (pure) | **nothing in `src/`** |
| data seam | `src/lib/data` | Persistence (`server-only` Supabase DAL; atomic writes via RPC, ADR-0005) | domain |
| shared utils | `src/lib/{date,fecha,format,utils}` | Helpers (`date`=pure local-component calendar; `fecha`=Chihuahua-tz wall clock + Postgres `date` bridge) | — |
| UI kit | `src/components/forge` | Visual primitives | lib/utils |

## The dependency arrow (enforced)
`components` (UI kit) + `lib/utils` ← used by ← `app` screens → call → `domain` + `lib/data`.
`lib/data` → `domain`. **`domain` imports nothing inward.** No screen imports another screen's `_components`; cross-sector composition happens at the route.

This direction is machine-enforced: `.dependency-cruiser.cjs` fails the build/commit if `src/domain` or `src/lib` imports `src/components` or `src/app`.

## Where do I add X?
- A business rule (how the gym works) → `src/domain/rules.ts` (+ a test in `rules.test.ts`).
- A new screen/page → `src/app/(app)/<sector>/page.tsx` (+ `_components/`).
- A reusable visual primitive → `src/components/forge`.
- A persisted entity / query → `src/lib/data` (the seam).
- A pure formatting/date helper → `src/lib/{format,date,utils}.ts`.
- A locked decision → a new `docs/adr/NNNN-*.md`.
