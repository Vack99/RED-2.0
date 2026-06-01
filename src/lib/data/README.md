# Data seam

The single boundary between screens and persistence. **Now on Supabase**
(the mock localStorage seam was retired in the cleanup slice). Each module is
`server-only`: it queries via `supabase-js`, shapes DTOs, and calls `src/domain`
rules — screens read DTOs, never raw rows.

## Shape (per sector)
- `clientes.ts` / `paquetes.ts` / `asistencia.ts` / `ventas.ts` / `cobro.ts` /
  `perfil.ts` / `plantillas.ts` / `resumen.ts` — `server-only` DALs. Reads are
  RLS-scoped (no explicit auth needed at the DAL — ADR-0001); they map DB rows to
  DTOs and delegate business logic to `src/domain` rules
  (e.g. `derivarEstado`, `stackPaquete`, `calcularResumenMes`, `renderPlantilla`).
- `derive.ts` (+ `derive.test.ts`) — pure row → DTO derivation, unit-tested.

## The flow (ADR-0001)
1. Supabase clients live in `src/lib/supabase/{client,server}.ts` (`@supabase/ssr`).
2. Reads happen in Server Components calling the DAL; writes go through Server
   Actions that re-auth + Zod-validate + delegate to the DAL. No cache
   invalidation: (app) reads are dynamic (cookie-bound through the Supabase
   server client), so there's no cached page to bust. (If a read ever opts into
   `'use cache'` + `cacheTag(...)`, add the matching `revalidateTag` to the
   write that touches it.)
3. DTOs are the contract: screens depend on DTO shapes, not on the schema.

**Rule:** nothing in this folder may import from `src/components` or `src/app`
(enforced by `.dependency-cruiser.cjs`).
