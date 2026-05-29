# Data seam

The single boundary between screens and persistence. **Mock today
(localStorage), Supabase tomorrow — the hook shapes do not change.**

## Today (mock)
- `store.ts` — `createStore<T>(key, seed)` + `useStore` (React `useSyncExternalStore`)
  exposing per-aggregate hooks: `useClientes`, `usePaquetes`, `usePase`,
  `useAsistTimes`, `usePerfil`, `useCobro`, `usePlantillas`, plus non-reactive
  getters (`getClientes`, `getPaquetes`, `getCobro`).
- `seed.ts` — mock seed data. **Mock-only; deleted at migration.**
- `types.ts` — legacy mock types; converge onto `src/domain/types.ts`.

## The swap to Supabase (next cycle — ADR-0001)
1. Add `src/lib/supabase/{client,server}.ts` (`@supabase/ssr`).
2. Add `server-only` DAL modules per sector here (`clientes.ts`, `paquetes.ts`,
   `asistencia.ts`, `ventas.ts`) that query via `supabase-js`, shape DTOs, and
   call `src/domain` rules (e.g. `derivarEstado`, `stackPaquete`).
3. Reads move into Server Components calling the DAL; writes into Server Actions.
4. Keep the same hook/DTO shapes so screens change minimally.

**Rule:** nothing in this folder may import from `src/components` or `src/app`
(enforced by `.dependency-cruiser.cjs`).
