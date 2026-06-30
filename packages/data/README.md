# @gym/data — the data seam

The single boundary between screens and persistence (ADR-0001). **On Supabase**
(the mock localStorage seam was retired in the cleanup slice). Every `./server`
module is `server-only`: it queries via `supabase-js`, shapes DTOs, and calls
`@gym/domain` rules — screens read DTOs, never raw rows.

## Subpath exports (ADR-0011 §5)
- **`@gym/data/server/*`** — the `server-only` DAL: `server/supabase.ts` (the
  per-request server client) + the 11 DAL modules + `server/export/`. Each keeps
  `import 'server-only'`; the poison-pill survives because Next transpiles the raw
  TS (`transpilePackages`), never a pre-built bundle.
- **`@gym/data/client`** — the browser `createBrowserClient` factory; **no**
  `server-only` (the publishable/anon key is safe in the browser).
- **`@gym/data`** (root) — `database.types.ts`, the generated schema types (also
  imported by the app's `proxy.ts`).

## Shape (per sector)
- `clientes.ts` / `paquetes.ts` / `asistencia.ts` / `ventas.ts` / `cobro.ts` /
  `perfil.ts` / `plantillas.ts` / `resumen.ts` — `server-only` DALs. Reads are
  RLS-scoped (no explicit auth needed at the DAL — ADR-0001); they map DB rows to
  DTOs and delegate business logic to `@gym/domain` rules
  (e.g. `derivarEstado`, `stackPaquete`, `calcularResumenMes`, `renderPlantilla`).
- `derive.ts` / `plantilla-ctx.ts` — pure row → DTO derivation (no `server-only`
  surface), unit-tested; they stay in the seam.

## The flow (ADR-0001)
1. The browser client is `src/client.ts`; the per-request server client is
   `src/server/supabase.ts` (both `@supabase/ssr`).
2. Reads happen in Server Components calling the DAL; writes go through Server
   Actions that re-auth + Zod-validate + delegate to the DAL. No cache
   invalidation: (app) reads are dynamic (cookie-bound through the Supabase
   server client), so there's no cached page to bust. (If a read ever opts into
   `'use cache'` + `cacheTag(...)`, add the matching `revalidateTag` to the
   write that touches it.)
3. DTOs are the contract: screens depend on DTO shapes, not on the schema.

**Rule:** `@gym/data` may import only `@gym/domain` and `@gym/format` — never
`@gym/ui` or the apps (ADR-0011 §6).
