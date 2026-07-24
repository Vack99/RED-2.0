# Loading-screens route inventory — 2026-07-22

Full enumeration of every `page.tsx` / `layout.tsx` / `template.tsx` / `loading.tsx` /
`error.tsx` under `apps/admin/src/app` and `apps/client/src/app`, read in full. This is
the decision table for which routes get a `loading.tsx` skeleton and what each skeleton
may/may not draw (it must never duplicate layout-owned chrome).

**Global facts (verified):**
- All `page.tsx` and `layout.tsx` files in both apps are server components — zero
  `"use client"` at the top of any of them (grepped, no matches).
- Exactly one `loading.tsx` exists in the whole monorepo:
  `apps/admin/src/app/(app)/clientes/[id]/loading.tsx`.
- Zero `error.tsx` files anywhere.
- Zero `Suspense` usages anywhere in `apps/` (grepped, no matches) — no manual
  streaming boundaries exist yet; only route-level `loading.tsx` would introduce one.
- 22 total routes: 9 in admin, 13 in client.

**A cross-cutting nuance that affects every classification below:** `getOperatorGym()`
in admin is wrapped in React's `cache()` and is *already* called once by
`(app)/layout.tsx` for its staff gate, before any page runs. Every admin page that
re-calls `getOperatorGym()` as its "serial head" pays zero marginal network cost —
it resolves from the per-request memo. The HEAVY/LIGHT counts below count it as a
read (per the literal 3-reads-is-HEAVY rule), but treat routes that hit HEAVY *only*
because of this free call as borderline, noted individually.

---

## Admin routes (`apps/admin/src/app`)

| Route | Component | Serial head | Parallel batch | Total reads | Class | Notes |
|---|---|---|---|---|---|---|
| `/` | server | — | — | 0 | STATIC | `redirect("/inicio")` only, no data, not even `async`. |
| `/login` (`(auth)/login`) | server | `resolveBrand()` (1) | — | 1 | LIGHT | Outside the `(app)` group: no staff gate, no TabBar, no template animation. Renders `LoginHero` or `StaticLogin` around `LoginForm`. |
| `/inicio` (`(app)/inicio`) | `getOperatorGym()` (1, free) | `getResumenMes`, `getRosterResumen`, `getAsistenciasHoy`, `resolveBrand` (4) | 5 | HEAVY | Matches prior table exactly (serial 1 + 4). |
| `/agenda` (`(app)/agenda`) | `getOperatorGym()` (1, free) → then `await searchParams` (serial, not a data read) | `getAgendaSemana(d)`, `getCoaches`, `getClassTypes` (3) | 4 | HEAVY | Matches prior table (serial 1 + 3). Uses `searchParams.d` (day nav) — awaited serially *between* the gym read and the parallel batch, not folded into it. |
| `/clientes` (`(app)/clientes`) | — (no serial head) | `Promise.all([getClientesRoster(), searchParams])` — 1 data read | 1 | LIGHT | Uses `searchParams.online`. Correction to prior phrasing: `getClientesRoster()` and `searchParams` are **both inside the same `Promise.all`**, not a serial-then-read shape — there's no serial head here at all. |
| `/clientes/[id]` | — (page shows only 1 await) | — | `getClienteFicha(id)` (1 visible call) | 1 visible / **9 real** | HEAVY | See below — this single await hides a genuinely heavy internal fan-out. Dynamic param `id`. Existing `loading.tsx` precedent. |
| `/cuenta` (`(app)/cuenta`) | `getOperatorGym()` (1, free, for `tz`) | `getPerfil, getResumenMes, getCobro, getPlanesEditor, listarPlantillas, getCoaches, getClassTypes, resolveBrand, listAboutValues, listFacilities, listStats, listFaqs, listMensajes, getMesesRespaldo` (14) | 15 | HEAVY | Matches prior table exactly (serial 1 + 14). The heaviest single admin route by call count. |
| `/asistencia` (`(app)/asistencia`) | `getOperatorGym()` (1, free) | `getClientesParaPase`, `getMarcadas` (2) | 3 | HEAVY (borderline) | **New — prior pass never read this.** 3 reads clears the literal HEAVY bar, but the serial head is the free cached call; marginal cost is really 2 parallel reads. Treat as LIGHT-leaning-HEAVY. |
| `/vender` (`(app)/vender`) | — (no serial head) | `Promise.all([searchParams, getPaquetes(), getClientesLite(), resolveBrand(), getOperatorGym()])` — 4 data reads + searchParams | 4 | HEAVY | **New — prior pass never read this.** Structurally different from every other admin route: `getOperatorGym()` is *inside* the parallel batch (needed only after the batch resolves, for `gym.timezone`), not a serial head gating it. Uses `searchParams.cliente` (deep-link preselect, `/vender?cliente=<id>`). |

### `/clientes/[id]` internal fan-out (why it's HEAVY despite one visible await)

`getClienteFicha(id)` in `packages/data/src/server/clientes.ts` is itself a deliberate
waterfall + fan-out, not a single query:
1. serial `getOperatorGym(supabase)` (free/cached) for `tz`
2. serial single-row `clientes` select, awaited alone on purpose — "await the cliente
   FIRST so a not-found id returns early without firing the 5 downstream reads... one
   extra round trip on the happy path is the accepted cost" (code comment)
3. on hit, a 7-way `Promise.all`: `asistencias` query, `ventas` query, `getVecinos`,
   `perfil` query, `listarPlantillas`, `getPaquetes`, `getCobro`

So the true shape is serial 2 + parallel 7 = 9 reads, confirming the existing
`loading.tsx`'s own comment ("~7-call fan-out") and its HEAVY classification.

---

## Client routes (`apps/client/src/app`)

| Route | Component | Serial head | Parallel batch | Total reads | Class | Notes |
|---|---|---|---|---|---|---|
| `/` (root `page.tsx`) | server | `headers()` (not a read) → conditional `getMarketingGym(slug)` (1) | conditional `Promise.all([getPlanesPublicos, getHorarioHoyPublico])` (2) | up to 3 | HEAVY (borderline) | Both the serial gym lookup and the parallel batch are skipped entirely (`[[], []]`) when there's no `x-gym` slug. On a resolved host it's 1 serial + 2 parallel = 3, clearing HEAVY by one. |
| `/registro` | server | `headers()`, `await searchParams` (not reads) → conditional `invitacionInfo(codigo)` (1, only with `?codigo=`) → conditional cross-tenant redirect path (`resolveTenant`, `createClient`, `construirUrlInvitacion` — rare, only on host/gym mismatch) → `resolveBrand()` (1) | — | 1 (no code) / 2 (with code) | LIGHT | `searchParams.codigo` used. The cross-tenant-shield path is a redirect, not a render, so it never needs a skeleton. |
| `/entrar` | server | `resolveBrand()` (1) | — | 1 | LIGHT | |
| `/restablecer` | server | `resolveBrand()` (1) | — | 1 | LIGHT | |
| `/activar` | server | `headers()`, `await searchParams` (not reads) → conditional `invitacionInfo(codigo)` (1) → conditional cross-tenant redirect (same shape as `/registro`) → `resolveBrand()` (1) | — | 1 (no code) / 2 (with code) | LIGHT | `searchParams.{codigo,correo}` used. Mirrors `/registro`'s structure. |
| `/activar/contrasena` | server | `await searchParams` (not a read) → `createClient()` + `supabase.auth.getUser()` (1, auth check + redirect gate) → `resolveBrand()` (1) | — | 2 | LIGHT | `searchParams.codigo` used. Serial dependent chain of 2, but both are cheap single lookups. |
| `/reservar` | server | `await searchParams` → `createClient()`+`getClaims()` (1, auth+redirect gate) → `getEsMiembro` (1) → conditional `resolveTenant`+`reclamarCliente`+`getEsMiembro` retry (only when membership missing) → `headers()` | `Promise.all([getAgendaSemanaMiembro, getSaldoMiembro, getPerfilResumenMiembro])` (3) | 5 (happy path) | HEAVY | Matches prior table exactly: "serial getClaims→getEsMiembro(→maybe reclamarCliente) + 3 parallel." `searchParams.perfil` used. |
| `/clase/[sessionId]` | server | `await params` → `createClient()`+`getClaims()` (1, auth+redirect gate) → `headers()` | `Promise.all([getClaseDetalleMiembro, getSaldoMiembro])` (2) | 3 | HEAVY | **New — prior pass never read this.** Dynamic param `sessionId`. `notFound()` if `detalle` is null. |
| `/confirmada/[sessionId]` | server | `await params` → `createClient()`+`getClaims()` (1) → `headers()` → `getConfirmacionReserva` (1, serial, no batch) | — | 2 | LIGHT | **New — prior pass never read this.** Dynamic param `sessionId`. Redirects to `/reservar` if no active booking — the "confirmed" ticket render only happens on the real happy path. |
| `/contacto` | server | `headers()` (not a read) → conditional `getMarketingGym(slug)` (1) → conditional dependent `getContacto(gym.id)` (1) | — (no batching — two sequential single-purpose reads) | 2 | LIGHT | **New — prior pass never read this.** Unlike `/`, `/nosotros`, `/precios`, this route does NOT parallelize its two gym-dependent reads — it's a true serial waterfall (`gym` then `contacto`), even though `contacto` doesn't need anything from `gym` except its id. |
| `/nosotros` | server | `headers()` (not a read) → conditional `getMarketingGym(slug)` (1) | conditional `Promise.all([getValoresPublicos, getStatsPublicas, getCoachesPublicos, getFormatosPublicos, getInstalacionesPublicas])` (5) | up to 6 | HEAVY | **New — prior pass never read this.** Same conditional-skip shape as `/`. |
| `/precios` | server | `headers()` (not a read) → conditional `getMarketingGym(slug)` (1) | conditional `Promise.all([getPlanesPublicos, getFaqsPublicas, getCoachesPublicos, getContacto, getValoresPublicos])` (5) | up to 6 | HEAVY | **New — prior pass never read this.** Same shape as `/nosotros`. |
| `/legal` | server (not even `async`) | — | — | 0 | STATIC | Pure static JSX (Términos y privacidad). No imports from `@gym/data`. |

---

## Layout chrome ownership

### Admin (`apps/admin/src/app`)

- **Root `layout.tsx`** (`apps/admin/src/app/layout.tsx`) — **fetches data itself**:
  `resolveBrand()` is awaited three times (`generateMetadata`, `generateViewport`, and
  directly in `RootLayout` for the injected `<style>` brand-token block). Owns
  `<html>`/`<head>`/`<body>`, the SSR brand-token `<style>` injection, `Providers`,
  and `Toaster`. No nav, no page-shaped chrome — nothing here collides with a page's
  `loading.tsx`, but this layout's own await happens **above** any per-page
  `loading.tsx` boundary, so it always blocks first paint regardless of the effort.
- **`(app)/layout.tsx`** — **fetches data itself**: `getOperatorGym()` as a
  staff/gym gate (`esStaff = ... .then(() => true).catch(() => false)`), also above
  any page-level `loading.tsx`. Owns: the centered phone-width shell divs, the single
  `<main>` scroller, and the bottom **`TabBar`** (5 tabs: INICIO/CLIENTES/ASIST/AGENDA/
  CUENTA). Falls back to `<SinGimnasio />` when the signed-in session isn't staff.
  **It does NOT render an `AppBar` anywhere in its source.**
- **`(app)/template.tsx`** — `"use client"`, no data. Wraps `{children}` in a
  `forge-enter` slide/fade animation div that re-mounts on every navigation. Because
  a `loading.tsx` renders inside `{children}` at this segment, the enter animation
  plays on the *skeleton* the instant a link is tapped (this is explicitly called out
  in the existing `clientes/[id]/loading.tsx` doc comment).
- **`(auth)/login`** has no layout of its own — it only inherits the root layout, so
  it gets no TabBar, no staff gate, and no `forge-enter` template animation.

**AppBar page-ownership — confirmed.** `(app)/layout.tsx` never imports or renders
`AppBar`; grepping its full source shows only `TabBar` as chrome. Since the layout
owns nothing above the page content but the outer shell + scroller + bottom tab bar,
`AppBar` (the per-screen header, e.g. `center="CLIENTE"`) **must** be page-owned —
each page's own component (`ClienteDetalle`, `CuentaScreen`, etc.) renders its own
`AppBar`. This makes `apps/admin/src/app/(app)/clientes/[id]/loading.tsx` rendering
its own `<AppBar center="CLIENTE" />` **correct**, not a duplication: the layout has
no `AppBar` to collide with. Any new `loading.tsx` for the other `(app)/*` routes
must follow the same rule — render the page's own `AppBar`, never assume the layout
provides one.

### Client (`apps/client/src/app`)

- **Root `layout.tsx`** (the *only* layout file in the client app — no nested group
  layouts exist) — **fetches data itself, twice over**: `resolveBrand()` (for the
  logo + brand-token `<style>` injection) and `createClient()` + `supabase.auth.
  getClaims()` (to compute `signedIn` for the header). Owns `<html>`/`<head>`/`<body>`
  and renders `<PublicHeader logo={...} signedIn={...} />` as the one persistent nav
  chrome, above every page.
- **`PublicHeader`** (`apps/client/src/app/_components/public-header.tsx`) is a
  `"use client"` island. It self-hides via `usePathname()` against
  `RUTAS_SIN_HEADER = new Set(["/entrar", "/registro", "/restablecer"])` — the
  full-viewport login-hero auth routes don't want the marketing header/drawer.
  **Gap worth flagging (not requested, but relevant to loading-screen mirroring):**
  `/activar` and `/activar/contrasena` also render a full-viewport `LoginHero`/
  `AuthShell` exactly like `/entrar`, but they are **not** in `RUTAS_SIN_HEADER`, so
  the public header still renders on top of them. Any `loading.tsx` written for
  those two routes should match what actually paints (header present), not assume
  parity with `/entrar`.
- No `template.tsx` anywhere in the client app — no forced re-mount/animation
  wrapper. No client-app equivalent of admin's bottom `TabBar`; nav is entirely the
  header + slide-in drawer.
- `AuthShell` (`apps/client/src/app/_components/auth-shell.tsx`) is not a route
  layout — it's a plain component 5 pages (`/entrar`, `/restablecer`, `/registro`,
  `/activar`, `/activar/contrasena`) render *inside themselves* as their fallback
  frame when the resolved brand has no `loginAnimation`. It is page-owned content
  (each page chooses to call it), not layout chrome — a `loading.tsx` for these
  routes would need to reproduce it directly, same as any other page-owned UI.

---

## Disagreements with prior table

None of the five routes in the prior partial table were contradicted by the
source — all five check out exactly as given:

- `(app)/cuenta` = serial `getOperatorGym` + 14 parallel — **confirmed**.
- `(app)/inicio` = serial 1 + 4 — **confirmed**.
- `(app)/agenda` = serial 1 + 3 — **confirmed**.
- `(app)/clientes` roster = 1 read + searchParams — **confirmed**, with one
  clarification: `getClientesRoster()` and `searchParams` are awaited together in a
  single `Promise.all`, not a serial-head-then-read shape. Worth noting only because
  it means there's no "gate" call to key a skeleton's timing off of — the read and
  the searchParams resolution race each other from the first tick.
- client `/reservar` = serial `getClaims`→`getEsMiembro`(→maybe `reclamarCliente`) +
  3 parallel — **confirmed** exactly, including the conditional retry branch.

Routes the prior pass never touched, now covered above: admin `/`, `/login`,
`/asistencia`, `/vender`; client `/`, `/activar`, `/activar/contrasena`,
`/clase/[sessionId]`, `/confirmada/[sessionId]`, `/contacto`, `/entrar`, `/legal`,
`/nosotros`, `/precios`, `/registro`, `/restablecer`.
