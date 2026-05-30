> **Tracked locally** — no issue tracker / git remote exists (local-only repo, by decision 2026-05-29). This markdown is the source of record; `/to-issues` and `/to-goal` consume it directly. If a GitHub/Linear tracker is provisioned later, replace this line with `> Tracked in: <issue-url>`.

# PRD — Forge mock → Supabase migration (epic)

Make Forge a real, persistent single-operator application on Supabase, wiring the
already-tested pure `src/domain` core into screens through a server-only Data
Access Layer (DAL) and thin Server Actions. This is an **epic**: `/to-issues`
decomposes it into shippable per-sector slices in the order
**prereqs → ventas → asistencia → clientes → retención → cuenta**.

## Problem Statement

Forge today is a faithful UI but a fake application. Everything the gym operator
does evaporates: a **venta** fakes a 700 ms delay and a random **folio**, then
disappears on reload; marking a **pase de lista** never consumes a class from the
**cliente**'s **saldo**; the dashboard's KPIs, every **cliente**'s `estado`,
`vence`, `diasRest`, `clases restantes`, `asistEsteMes`, and the **HISTORIAL** /
**PAGOS** lists are frozen demo literals identical for every client. State lives
only in one device's `localStorage`, there is no login, and the brand drifts
between `"FORGE"` and `"Forge Bootcamp"` across six spots. The operator cannot
trust a single number on screen, cannot use the app from a second device, and
cannot actually run their gym on it.

## Solution

From the operator's perspective: **Forge becomes real.** They log in once;
selling, renewing, and marking attendance write to a real database and persist
everywhere; package **stacking**, **forfeit**, and class consumption follow the
brief's rules exactly; every derived number (`estado`, `vence`, `diasRest`,
`clases restantes`, `asistEsteMes`, dashboard totals) is computed from real
**ventas** and **asistencias** at read time, so it is always accurate and never
drifts; WhatsApp messages render from stored **plantillas** with the **FORGE**
brand; and their data is private at the database level via RLS. Attendance can
be back-entered a week at a time from a paper list, because every **asistencia**
is one row with an absolute Chihuahua-local date.

Under the hood this is the SECTOR-FIRST data seam swap (ADR-0001/0002/0003): the
pure 28-test domain rules stay untouched and get wired in through a server-only
DAL that returns DTOs, with writes flowing through thin Server Actions that
re-authenticate, validate, delegate, and revalidate.

## User Stories

### Authentication & data isolation
1. As the gym operator, I want to log in with a single secure account, so that only I can see or change my gym's data.
2. As the gym operator, I want my session to persist across refreshes and stay refreshed automatically, so that I'm not logged out mid-task.
3. As the gym operator, I want every `(app)` screen gated behind auth, so that **cliente** data is never publicly reachable.
4. As the gym operator, I want my data isolated by RLS keyed to my account, so that it is protected at the database level, not just hidden in the UI.
5. As the gym operator, I want my sales, attendance, and edits saved to a real database, so that my data survives reloads and is identical on every device I use.

### Ventas (sell / renew)
6. As the gym operator, I want to sell or renew a **paquete** to an existing **cliente** and have it **stack** onto their current **saldo**, so that buying early ADDS classes and days instead of resetting them.
7. As the gym operator, I want a new **cliente** created on their first **venta**, so that I can onboard and sell in one flow.
8. As the gym operator, I want each **venta** to receive a real, unique **folio** from the database, so that **recibos** are traceable and never collide.
9. As the gym operator, I want the **recibo** to show the real purchase date and the computed **vigencia** end, so that the **cliente** sees accurate dates.
10. As the gym operator, I want to record the metodo de pago (efectivo / transferencia / tarjeta / **por pagar**), so that I can track **pendientes**.
11. As the gym operator, I want the **recibo**'s WhatsApp confirmation rendered from a **plantilla** with the **FORGE** brand, so that messaging is consistent and on-brand.
12. As the gym operator, I want the roster and metrics to reflect a **venta** immediately after I make it (read-your-writes), so that I never act on stale data.
13. As the gym operator, I want a **venta** to atomically persist the venta row AND mutate the **cliente**'s **saldo**, so that the two can never disagree.

### Asistencia (pase de lista)
14. As the gym operator, I want marking a **cliente** present to consume exactly one class from their **saldo**, so that **clases restantes** stays accurate.
15. As the gym operator, I want **Ilimitado** clients to never lose a class on attendance, so that unlimited packages behave correctly.
16. As the gym operator, I want a same-day duplicate **asistencia** to consume a class each time, so that the rule "a class is a class" holds (no dedup).
17. As the gym operator, I want to undo an **asistencia** (soft-delete) and have the class restored, so that mistakes are reversible without erasing history.
18. As the gym operator, I want to back-enter a whole week of attendance from a written list in one sitting, so that I can catch up from paper.
19. As the gym operator, I want each **asistencia** stored as an absolute America/Chihuahua calendar date, so that the history is correct no matter when I enter it.
20. As the gym operator, I want the recorded check-in time to be a real timestamp, so that the history reflects reality rather than a fabricated value.

### Clientes (roster & ficha)
21. As the gym operator, I want each **cliente**'s `estado` (activo / por_vencer / sin_clases) derived from their real **saldo**, so that it is never stale.
22. As the gym operator, I want `vence`, `diasRest`, **clases restantes**, and `asistEsteMes` computed at read time, so that they always match the underlying facts.
23. As the gym operator, I want a **cliente**'s **HISTORIAL** to list their real **asistencia** rows for the month, so that I see actual attendance, not a fixed demo list.
24. As the gym operator, I want a **cliente**'s **PAGOS** to list their real **venta** history, so that I can see what they actually bought.
25. As the gym operator, I want to store an optional email and birthday on a **cliente** while phone stays required, so that I keep the WhatsApp spine but can capture extras.
26. As the gym operator, I want reactivating a lapsed **cliente** to keep their full history, so that I never lose past data.
27. As the gym operator, I want to search, filter, and sort the roster by días / clases / `estado` using derived values, so that triage reflects reality.
28. As the gym operator, I want the **ficha**'s "COMPRADO" and "ALTA" dates to come from the real active **venta** and the **cliente**'s creation date, so that they're correct per client.
29. As the gym operator, I want to send a **cliente** a WhatsApp recordatorio rendered from a **plantilla**, so that retention messaging is one click and on-brand.

### Retención (plantillas)
30. As the gym operator, I want WhatsApp **plantillas** stored in the database and rendered with real tokens (`{nombre}` `{clases}` `{paquete}` `{vence}` `{dias}` `{precios}` `{datos_pago}`), so that messages are consistent and editable data.
31. As the gym operator, I want WhatsApp links to prefix `+52`, so that they open correctly for Mexican numbers.
32. As the gym operator, I want a **plantilla** typo to leave the `{token}` visible rather than blanking it, so that I notice and fix it.
33. As the gym operator, I want the two inline hand-built WhatsApp messages (the **recibo** confirmation and the **ficha** recordatorio) to both route through `renderPlantilla`, so that there is one home for message bodies.

### Cuenta & inicio (dashboard / perfil)
34. As the gym operator, I want the **inicio** dashboard's asistencias hoy, vigentes, ingresos, and ventas computed from real data, so that the numbers are trustworthy.
35. As the gym operator, I want period deltas (vs ayer, vs mes anterior) and the attendance sparkline computed from real series, so that trends are accurate.
36. As the gym operator, I want the **cuenta** "Resumen del mes" to reflect real **ventas** + **asistencias** for the month, so that monthly performance is accurate.
37. As the gym operator, I want my **perfil** and datos de **cobro** stored and read from the database behind auth, so that **recibos** and transfers use my real details.
38. As the gym operator, I want the brand shown as **FORGE** everywhere from a single stored value, so that there is no "Forge Bootcamp" drift.
39. As the gym operator, I want the **cuenta** sub-editors (Plantillas, Notificaciones, Datos de cobro, Editar perfil, Editor de paquetes) to keep their "próximamente" labels but display real data, so that the screen is honest about what's editable.

### Maintainer / data-integrity stories
40. As the maintainer, I want `estado`, `vence`, `diasRest`, `asistEsteMes`, and `inicial` derived (never stored), so that the dual-write drift the seed exhibited can't recur (ADR-0002).
41. As the maintainer, I want all database access funneled through a server-only DAL returning DTOs, so that there is one auditable place for every query and raw rows never cross the boundary (ADR-0001).
42. As the maintainer, I want writes to flow through thin Server Actions that re-auth with `getClaims()` + Zod-validate + delegate, so that the page gate and the action gate are independent and inputs are validated before touching the database.
43. As the maintainer, I want session refresh in `proxy.ts` (never `middleware.ts`), so that the app follows Next 16 conventions.
44. As the maintainer, I want the legacy `localStorage` store and the offset-date scaffolding (`DEMO_TODAY` / `VIG_END` / `PaseGrid`) removed once the DAL lands, so that there is a single source of truth and no hardcoded demo numbers remain.
45. As the maintainer, I want the dependency boundary (`src/domain` + `src/lib` ✗→ `src/components` + `src/app`) to stay green after the new Supabase code lands, so that the data seam stays swappable and the domain stays pure.

## Implementation Decisions

### Architecture & stack (locked by ADRs; verify Supabase API shapes at implementation)
- **ADR-0001 (Supabase + RLS, no ORM):** `supabase-js` used directly inside a **server-only DAL per sector** that returns DTOs and calls `src/domain` rules. Reads happen in Server Components via the DAL; writes via **thin Server Actions** that re-authenticate, Zod-validate, and delegate. **RLS enabled on every table**, policies keyed to `(select auth.uid())` as the primary security boundary. Auth via `@supabase/ssr` httpOnly cookie sessions; the cookie adapter implements **only `getAll`/`setAll`**. Authorize in server code with `getClaims()`/`getUser()`, **never `getSession()`**. The exact `@supabase/ssr` shapes (`createBrowserClient` / `createServerClient`) are **verify-at-implementation** once the package is installed.
- **Next 16 specifics (spec §11, verified against bundled v16.2.6):** route gating + session refresh live in **`proxy.ts`** (`export async function proxy(request)`, Node runtime) — **`middleware.ts` is forbidden**. Async request APIs (`cookies()`, `headers()`, `params`, `searchParams`) **must be awaited**. After a **venta** persists + mutates the cliente, and after a **pase** toggles, call **`updateTag('clientes','max')`** for read-your-writes; `revalidateTag` now requires its 2nd (cacheLife) argument. Use React `cache()` for per-request memoization in the DAL. Turbopack is the default (no webpack config). Env: **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`**.
- **ADR-0002 (Derived, not stored):** `estado`, `vence`, `diasRest`, `asistEsteMes`, `inicial` are **computed at read** via domain rules — `derivarEstado`, `calcVigenciaEnd`, `diasRestantes`; `asistEsteMes` from a COUNT of **asistencia** rows; `inicial` from `nombre`. `forfeit` is applied **lazily at read** (no cron).
- **ADR-0003 (Stacking / forfeit / dates):** **stacking** is additive (`stackPaquete`); each **asistencia** consumes one class (`consumirClase`), no same-day dedup; **Ilimitado** never decrements; attendance is **one row per asistencia with an absolute America/Chihuahua date** plus a soft-delete column.

### Decision: active-saldo materialization (extends ADR-0002)
Because **stacking** is path-dependent (buying early adds days/classes onto whatever remains), the active **saldo** is persisted as a **stored running balance** on the **cliente**, mutated transactionally by the write actions, while `estado`/`diasRest` remain derived from it:

```
cliente.clases_restantes : int  | NULL  -- NULL = Ilimitado
cliente.vence            : date         -- stored running expiry (stacked)
-- derived at read, never stored:
diasRest = diasRestantes(vence, hoy)             -- hoy in America/Chihuahua
estado   = derivarEstado({ clases: clases_restantes-as-Clases, dias: diasRest })
clases_restantes shown as 0 when forfeit(clases, diasRest) === 0
```

This is a deliberate, minimal extension of ADR-0002: **`vence` becomes a stored running balance** (not purely derived) because a stacked expiry can't be recomputed from a single `fechaCompra`. To be recorded as an ADR addendum/confirmation when the schema lands. The full **venta** / **asistencia** ledger is always retained as the audit source of truth; the running balance is the queryable projection.

### New domain module (pure, added to `src/domain`)
- **`calcularResumenMes`** — aggregates **ventas** + **asistencias** for a period into a `ResumenMes` DTO (`ingresosMes`, `ventasMes`, `asistMes`, `asistenciasHoy`, `asistenciasAyer`, `ingresosSemana`, and period-over-period deltas). **Pure** — `hoy`/timezone are passed in, never read from a clock — matching the rest of the domain core. Add the `ResumenMes` type to `src/domain/types.ts`. This replaces the frozen `HOY` seed object and the hardcoded sparkline/deltas.
- `renderPlantilla` already supports `{paquete}` in code (`PlantillaContext.paquete` + a test); **no code change** — only spec §7's token list needs reconciling (see Further Notes).

### Data Access Layer (server-only, per sector)
DAL modules per sector (`clientes`, `ventas`, `asistencia`, `paquetes`, `plantillas`, `cobro`, `perfil`) query via `supabase-js`, **shape DTOs**, and call domain rules. A **pure row→DTO derivation layer** is extracted (rows + a passed-in `hoy` → DTO with `estado`/`vence`/`diasRest`/`asistEsteMes`/`inicial`) so it is unit-testable without Supabase. The DAL never lets raw rows cross the boundary and is the single auditable place every query lives. New Supabase code under `src/lib/supabase` must not import from `src/components`/`src/app` (boundary stays green).

### Write seam (thin Server Actions)
- **`crearVenta`** — re-auth (`getClaims`) → Zod-validate → for an existing **cliente** compute `newSaldo = stackPaquete(currentSaldo, compra)` and the stacked `vence`, insert the **venta** (DB-generated **folio**), persist the mutated **cliente** running balance, record metodo de pago → `updateTag('clientes','max')`. New clients are inserted first. Returns the row the **recibo** renders from.
- **`togglePase`** — re-auth → Zod-validate → insert (or soft-delete) an **asistencia** row with an absolute Chihuahua date + real timestamp, and `consumirClase` on the **saldo** (Ilimitado untouched; undo restores the class) → revalidate clientes/asistencia tags.
- **cuenta sub-editors** stay "próximamente" stubs (no write actions this epic) but read real data.

### Validation
Install **`zod`** (not currently a dependency). One schema per Server Action input; invalid payloads are rejected before the DAL is touched.

### Schema (Supabase, RLS on every table, owner = `(select auth.uid())`)
- **`perfil`** — single-operator identity: `negocio` (stored once = **"FORGE"**), coach name, phone, ciudad.
- **`cobro`** — titular, banco, CLABE, tarjeta, metodos; feeds the `{datos_pago}` token.
- **`paquetes`** — catalog: `nombre`, `clases` (`int` NULL = **Ilimitado**), `vigencia_tipo` (`'dias' | 'mes'`) + `vigencia_dias` (`int`, NULL for `'mes'`), `precio`.
- **`clientes`** — stored facts: `id`, `nombre`, `tel` (**required** — the WhatsApp spine), `email` (optional), `birthday` (optional), `created_at` (alta); active running balance `clases_restantes` (`int` NULL = Ilimitado), `vence` (`date`), active-paquete reference/snapshot.
- **`ventas`** — `id`, `cliente_id`, paquete snapshot (nombre/clases/vigencia), `monto`, `metodo` (**MetodoPago**: `efectivo | transferencia | tarjeta | pendiente`, where `pendiente` = **por pagar**), `folio` (DB identity/sequence), `fecha` (timestamptz).
- **`asistencias`** — `id`, `cliente_id`, `fecha` (`date`, absolute America/Chihuahua), `hora`/timestamp, `deleted_at` (soft-delete), `created_at`.
- **`plantillas`** — `id`, `clave` (`recordatorio | renovar | ultima`), `body` (with `{token}` placeholders).

**Sentinel mapping** (DB ⇄ domain union types), decided at the DAL boundary so the domain never sees magic values: `clases NULL ⇄ "ilimitado"`; `vigencia_tipo='mes' ⇄ Vigencia "mes"`, else `vigencia_dias ⇄ Vigencia number`. The legacy `"∞"` sentinel and the `vigencia`-as-display-string from `src/lib/data/types.ts` are dropped.

### Schema/DDL tooling
Apply schema via Supabase MCP `apply_migration` against project `hjppxawglmukfvsgmcog`; `generate_typescript_types` to produce DB types; run `get_advisors` (security) after each DDL change to catch missing-RLS regressions.

### Brand & type convergence
Remove all **6** `"Forge Bootcamp"` literals (seed perfil, `renovar` template, root layout metadata, **recibo** WA body + footer, **ficha** WA body); reference the single stored `perfil.negocio = "FORGE"`. Converge the duplicated **`MetodoPago`** (legacy `src/lib/data/types.ts` vs `src/domain/types.ts`) onto the domain type.

### Slice sequence (for `/to-issues`)
`prereqs` (install deps, `src/lib/supabase/{client,server}`, schema+RLS, `proxy.ts` + single-operator login) → **`ventas`** (first tracer bullet) → `asistencia` → `clientes` → `retención` → `cuenta`. The domain core is already done.

## Testing Decisions

A good test asserts **external behavior, not implementation details** — given inputs, assert outputs; never assert private structure. Tests are deterministic: `hoy` and the timezone (America/Chihuahua) are passed in explicitly, the clock and randomness are never read in pure code (the domain core already bans `Date.now()`/`Math.random()`).

**Prior art:** `src/domain/rules.test.ts` — 28 Vitest tests in a table-driven, worked-examples style (e.g. `13 May 2026 + 20 días => 2 Jun 2026`). New pure tests mirror this exactly.

**TDD targets this epic (selected):**
- **`calcularResumenMes`** — unit-tested as a pure rule alongside the existing 28: feed fixed **ventas**/**asistencias** + a fixed `hoy`, assert `ingresosMes` / `ventasMes` / `asistMes` / hoy-vs-ayer and prior-period deltas. Lives in `rules.test.ts`.
- **Pure DAL row→DTO derivation** — feed stored rows (cliente facts, ventas, asistencias) + a fixed `hoy`, assert the derived DTO's `estado` / `vence` / `diasRest` / `asistEsteMes` / `inicial` and the **forfeit**-on-read behavior. Extracted as pure functions so **no Supabase is needed** to test them.

**Not unit-tested here — exercised as integration against a Supabase branch** (`create_branch` + seeded rows): DAL queries and the `crearVenta` / `togglePase` Server Actions (they need live DB + auth + RLS). Key assertions: RLS denies cross-account reads; `crearVenta` **stacks** correctly and yields a unique **folio**; `togglePase` soft-delete restores the class; **Ilimitado** never decrements.

**Out of dedicated unit coverage this epic (per scope):** Zod action-input schemas and the es-MX formatting helpers are exercised via type-checking and the integration pass rather than dedicated unit tests; they can graduate to unit tests if a bug warrants it.

## Out of Scope

- **Goal B — the `sector-map` skill extraction.** Deferred until Forge proves the framework end-to-end (after the first real slice ships). Design lives in spec Appendix A.
- **cuenta sub-editors** (Plantillas / Notificaciones / Datos de cobro / Editar perfil / Editor de paquetes): data becomes real, but the editing UI stays "próximamente."
- **Multi-operator / multi-tenant.** Single operator only.
- **Folio per-year-reset scheme** — default to a DB identity/sequence; the reset policy is an open item resolved when the `ventas` table is finalized.
- **Payment processing / integrations** — metodo de pago is *recorded*, not charged.
- **Birthday / email automations** — fields are stored, but no reminders/automation are built.
- **`vender.tsx` decomposition** (~543 lines) and the cosmetic `ClienteDetalle` → `…Screen` naming drift — refactor candidates, not migration blockers.
- **Provisioning a git remote / issue tracker / GitHub Issues** — local-only by decision; `docs/prds/` is the record.

## Further Notes

- **`{paquete}` token is a doc bug, not work:** the code (`PlantillaContext.paquete` + a covering test) already substitutes `{paquete}`. Reconcile spec §7's six-token list (which omits it) — the only action is editing the doc.
- **Supabase API shapes verify-at-implementation** (`createBrowserClient`/`createServerClient`, `getAll`/`setAll`, `getClaims`) per ADR-0001 / spec §13 once `@supabase/ssr` is installed. Read `node_modules/next/dist/docs/` before writing Next 16 code (AGENTS.md — this is a non-standard Next 16.2.6).
- **Operational gotchas:** **pnpm only** (native-build approvals in `pnpm-workspace.yaml` `allowBuilds`: sharp, unrs-resolver, esbuild); **never run `husky` with an argument** (corrupts `core.hooksPath`); never reintroduce `middleware.ts`; **confirm which git identity owns Forge commits** before committing (the machine's global identity differs from the memory email; consider a repo-local `git config`).
- **Supabase MCP is live** at project `hjppxawglmukfvsgmcog` (the only untracked file, `.mcp.json`, wires it); use `apply_migration`, `generate_typescript_types`, `get_advisors`.
- **Boundary discipline:** `.dependency-cruiser.cjs` rule `domain-data-no-upward-ui` (error) forbids `src/domain`/`src/lib` importing `src/components`/`src/app`; new `src/lib/supabase` code must obey it. The deferred `no-orphans` rule is intended to be enabled this cycle once the domain core is wired into screens.
- **Tracker:** local-only; this file in `docs/prds/` is the source of record and feeds `/to-issues` → `/to-goal` directly. No remote publish was performed.
