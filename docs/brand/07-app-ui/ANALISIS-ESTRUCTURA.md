# Analysis — how far customization can go, and what to do with the iBookit admin structure

Worktree `ibookit-app-ui`, branch based on `main` @ `3f54ec3`. Written 2026-08-16.
Companion to `HANDOFF.md` (which prepped this work) and `prototipo-admin-v1.dc.html` (the new admin UX).

**Method.** Five parallel investigators (brand-seam ceiling, brand forks in app code, admin IA +
`/vender` capability census, prototype read, scale/maintenance risk) → one synthesizer → three
adversarial reviewers on distinct lenses (over-engineering, future rot, functional regression).
Every load-bearing claim below carries a `file:line` citation and was re-verified by at least one
reviewer. All three reviewers returned **SOUND_WITH_CORRECTIONS**; the structural verdict survived
every attack. The corrections are folded in and marked.

**Known gap.** The screen-by-screen prototype deep-read (the agent tasked with the `DCLogic` block at
line 428+) exceeded its output cap and returned nothing. The dropped-capability half of that work was
recovered by the regression reviewer (§7), but a per-screen `paint / behaviour / new` verdict table
does **not** yet exist. That is the first thing the next session should produce — see §9.

---

## 1 · The premise correction (the most valuable finding)

> *"the current structure for the current gyms Forge and RED is fully customized for them"*

**It is not.** The admin app is ONE structure skinned two ways. A whole-repo sweep for brand
conditionals (`=== "red" | "forge" | "base"`, `brand.id ===`, `brandId ===`, tests excluded) returns
exactly **three lines**, all above `packages/`:

| File | Line | What it is |
|---|---|---|
| `apps/admin/src/app/(app)/vender/_components/ticket-twin.ts` | 44 | `return brandId === "red" ? RED_TICKET : FORGE_TICKET` — four CSS colour strings for an HTML receipt email, because Gmail strips `<style>` |
| `apps/admin/src/lib/token-overrides.ts` | 25 | demo-fixture check (`base` → purple demo palette) |
| `apps/client/src/lib/token-overrides.ts` | 25 | the identical check |

Forge and RED operators see byte-identical screens, byte-identical nav, byte-identical flows —
different hex values. `apps/admin/src/app/(app)/layout.tsx:14-22` is one literal `TABS` array and
`AppLayout` never reads `brand` or `x-brand` at all.

**Corollary:** "leave their structure and integrate a new one for us" would mean *creating* the second
structure this repo has spent four phases avoiding. There is nothing to leave alone.

### 1.1 · The RED customization that looks structural is in the CLIENT app

The ~20 `.dark[data-brand="red"]` neon selectors (ignited pips, breathing progress bars, roster glow)
live at `apps/client/src/app/globals.css:257-486`. `apps/admin/src/app/globals.css` has only two
`@import` lines (`:12` neon.css, `:17` recibo.css) and no brand-scoped rules of its own. **The app
being restructured is the one with essentially zero brand divergence.**

### 1.2 · Two further premise corrections

- **`HANDOFF.md` §2 is wrong about `/vender`.** It claims `/vender` carries "the whole
  payment-correction surface shipped through #266." It does not. Corrections live on the client ficha
  at `apps/admin/src/app/(app)/clientes/[id]/_components/pago-sheet.tsx` — paquete swap (`:438-461`),
  monto (`:463-466`), método (`:467-470`), fecha (`:471-514`), delete-with-clawback (`:346-379`) —
  writing through `clientes/[id]/actions.ts`. That surface is untouched by any `/vender` decision.
  This materially lowers the risk of the `/vender` question.
- **`HANDOFF.md` §3 Q2 is already answered by the code.** Both prototype behaviours flagged there as
  "real behaviour, not paint" already ship: the `/inicio` renewal bucket strip is
  `inicio/_components/inicio.tsx:312 RenovarTile` + `:430 AunATiempoTile`, driven by
  `CUBO_ORDEN`/`CUBO_LABEL` from `@gym/domain/lifecycle`; the `/asistencia` CON RESERVA split is
  `asistencia/_components/asistencia.tsx:594,599`.

---

## 2 · The ceiling — exactly what a brand can and cannot change today

### CAN — an 8-field closed contract (`packages/brand/src/registry.ts:45-96`)

| Field | Reach |
|---|---|
| `id` | the `BrandId` union member (`brand-id.ts`) |
| `tokens` | a complete light **and** dark fill of 33 named CSS variables (`tokens.ts:22-63`) |
| `css` | precomputed from those tokens |
| `copy` | exactly three strings: name, description, optional tagline |
| `logo` | a React component taking size / animate / glow |
| `appIcon` | a self-contained SVG string for the `/icon` favicon route |
| `loginAnimation?` | an optional **full-screen** login hero (`red/login-hero.tsx:50-64` renders `minHeight: 100dvh`) |
| `defaultScheme?` | `"light" | "dark"` — **admin never reads it**, see §7.1 |

**Plus one data layer:** per-gym `token_overrides` re-paints the *same* 33 names, validated by a zod
schema built from the same `TOKEN_KEYS` source (`token-overrides.ts:22-57`) with a charset whitelist
that makes `</style>` / `{` / `}` injection unrepresentable. The override vocabulary is provably never
wider than the module vocabulary. **It is not wired** — `apps/admin/src/lib/token-overrides.ts:19-26`
returns a hardcoded purple demo palette; the `gym.token_overrides` jsonb column exists
(`packages/data/src/database.types.ts:714`) and is never fetched.

**Plus one documented escape hatch:** a literal per-brand CSS file (`packages/brand/src/red/neon.css`,
`red/recibo.css`) scoped by `[data-brand="red"]` and `@import`ed **unconditionally** into both apps'
globals.css. Its reach is bounded by review, not by the type system — dependency-cruiser only checks
JS/TS import edges, never CSS selector scope.

### CANNOT

Routes, nav order, nav labels, screen layout, screen composition, or any copy beyond the
name/description/tagline triad. `BrandModule` has no `nav`, `routes` or `layout` field.

**And both ADRs forbid widening it into structure.**
`docs/adr/0008-platform-multitenant-gym-rls-brand-modules.md:60`, under *"What a future reader must not
undo"*: **"Do not let a brand module become anything but presentation. Divergence is
tokens/logo/animation/copy; rules and schema are shared."**
`docs/adr/0012-host-brand-resolution.md`: *"Branding is presentation-only — it never changes data
shape, rules, or authorization."* Any nav-shaped brand slot requires deliberately amending one of these.

### The typography hole

The prototype's Hanken Grotesk is **not expressible at all** — the face is hardcoded at
`apps/admin/src/app/layout.tsx:12-16` (`Outfit` from `next/font`). So "a brand only re-skins" is not
currently true even for a purely visual rebrand. See decision D2 in §6.

### What is machine-guarded, and what is not

- **Guarded:** `.dependency-cruiser.cjs:52-64` (`brand ✗→ data|domain`); `brand.test.ts:13` pins the
  census to exactly `["base","forge","red"]`; `tokens.test.ts` hand-pins every brand's emitted CSS
  with no snapshot and no `-u` path, deliberately.
- **NOT guarded:** *nothing anywhere stops or flags an app-code `brandId === "…"` branch.* All seven
  dependency-cruiser rules key on package paths; none carries a brand dimension. All eleven
  `tools/guards/` check non-brand axes.
- **Also not guarded (reviewer finding):** `brand_module_id` is `text not null` with **no FK and no
  CHECK**, stated deliberately at `supabase/migrations/20260702150000_create_gym_tenant_spine.sql:12,21`.
  Combined with the `Object.hasOwn` + `DEFAULT_BRAND` fallback at `apps/admin/src/lib/brand.ts:16-18`,
  a mistyped brand key on a real customer's gym row renders that customer in neutral chrome, silently.
  Nothing reconciles the DB's brand keys against the registry census. **This is the brand seam's
  weakest link — a hand-typed DB value, not app code.**

---

## 3 · The four options

### A · Tokens only, one structure — widen paint, re-flow the app once ✅ RECOMMENDED

**Shape.** Nothing structural forks per brand. iBookit ships as
`packages/brand/src/ibookit/{tokens.ts,logo.tsx,app-icon.ts,login-hero.tsx}` + one row in
`registry.ts:103` + one member in the `BrandId` union (`brand-id.ts:9`) + one census line
(`brand.test.ts:13`). The admin re-flow — dock order, `/clientes/nuevo`,
`/clientes/[id]/historial`, `/clientes/[id]/mensaje` — ships **once** inside
`apps/admin/src/app/(app)/` for every tenant.

**Costs.** One brand module. The re-flow paid once instead of per brand. Forge and RED operators get
the new dock and the new sale route — a real change to a real operator's habits, not a no-op.

**Failure mode.** Fails only if a tenant genuinely needs a different *flow*. Zero evidence: Forge and
RED have maximally different visual identities (dark-only crimson neon vs light gold) and share one
route tree, one nav, one flow set, diverging by four hex strings inside an email.

> **Reviewer correction (cost, both directions).** Adding brand N+1 is *cheaper* than first claimed —
> module dir + registry row + `BrandId` member + census line; a `tokens.test.ts` fixture is optional,
> not enforced. But a brand module is **not** paid by that brand: `dynamic(` count across
> `packages/brand/src` and both apps is **0** and `registry.ts:3-14` imports all three statically, so
> ~45 KB per module is paid by **every tenant, forever**, plus one unconditional stylesheet per
> bespoke-CSS brand (3 extra mechanical edits: package exports + both globals). At a ten-brand
> horizon that is roughly half a megabyte of dead brand JS in every request. **The code-brand count
> must stay small and deliberate** — which makes the missing per-gym logo *data* path load-bearing
> rather than cosmetic (§7.3).

### B · Config-driven slots — optional data fields on `BrandModule`

**Shape.** Add optional members to `BrandModule` (`registry.ts:45-96`) consumed with a `??` fallback
at exactly one call site. **The pattern is already proven here**: `loginAnimation?` (`registry.ts:89`)
+ `LoginHero ? <LoginHero>…</LoginHero> : <StaticLogin>` at `(auth)/login/page.tsx:17-26` + the
invariant test at `(auth)/login/_components/static-login.test.ts:51-62`, which loops
`Object.values(brands)` so ONE test covers every brand that will ever exist.

**Costs.** One field + one `??` + one registry-iterating invariant test per slot. Anything nav-shaped
additionally needs an ADR-0008/0012 amendment — a deliberate act, not a drop-in field.

**Failure mode.** Slots multiply; their combinations go untested. Two slots are legible; ten are 2^10
shells nobody renders. **Routes cannot be slotted at all**: `typedRoutes: true` in
`apps/admin/next.config.ts` means every href in a nav table must exist on disk for every brand — so a
nav slot can only reorder, relabel or hide routes that already exist for everyone.

**Verdict.** Use for exactly ONE retrofit — the receipt palette. **Do not open a nav slot.**

> **Reviewer correction.** Prefer a `Record<BrandId, TicketPalette>` in `ticket-twin.ts`
> (compile-time exhaustive, zero contract surface) over a new `BrandModule` field — and in the *same*
> commit move `.recibo-card`'s Forge defaults out of `apps/admin/src/app/globals.css:159-164`, which
> hardcodes Forge cream for **every** brand and is overridden only by `[data-brand="red"]`
> (`red/recibo.css:11-13`). Fixing only the JS half leaves the on-screen card Forge-cream for iBookit.

### C · Per-brand route trees ❌ REJECT

**Shape.** Fork `apps/admin/src/app/(app)/` — parallel route groups, a `[brand]` segment, or per-brand
`dynamic()` screen imports.

**Costs.** Duplicates from the ~543 KB admin route-tree pool instead of the ~30–45 KB brand-module
pool, and ships to every tenant because the registry is statically imported. Every guard in
`tools/guards/` becomes O(brands): `loading-coverage.test.ts:12-25` pins a literal list of every
`loading.tsx` in both apps, so N brands means N× that list, by hand.

**Failure mode.** Ships into strong enforcement on the *wrong axis* — nothing in
`.dependency-cruiser.cjs` carries a brand dimension, so every guard would be written from scratch. The
repo's own doctrine on unguarded invariants is stated at `tools/guards/anon-read-surface.test.ts:12-21`:
a certified audit drifted **the next day** and nothing noticed for 27 days. It also collides with the
multi-gym operator path already in the shell (`lib/tenant.ts:50 decideTenant`,
`(app)/layout.tsx:59-66 VariosGimnasios`) — a franchise manager covering two locations would learn two
different products.

### D · Bolt brand-conditional branches on ❌ REJECT (the null option)

**Shape.** Another `brandId === "ibookit"` ternary; another `[data-brand="ibookit"]` stylesheet
`@import`ed unconditionally into both apps.

**Failure mode — already failing, observably, at N=3.** The single existing branch silently gives
`base` Forge's receipt identity (`ticket-twin.ts:44`, the default arm), and its test **blesses** that
fallthrough: `ticket-twin.test.ts:70` asserts `ticketPalette("otra-marca")` returns `FORGE_TICKET`. At
ten brands that pattern produces a green suite while eight brands wear the wrong identity. It also
created a hand-synced hex duplicated across two files — `ticket-twin.ts:38` (`label: "#7e0d10"`, with
the comment *"Must agree with packages/brand/src/red/recibo.css"*) and `red/recibo.css:12` — with a
comment as the only guard and no test comparing them. **One brand-conditional feature produced one
unguarded manual-sync obligation.**

---

## 4 · Recommendation

> **Take Option A: restructure the admin app once, brand-agnostically, and keep brand at paint. Use
> Option B for exactly one retrofit (the receipt palette). Reject C and D.**

The chain:

1. **Question (b) dissolves on contact with the code.** Three brands share one route tree, one `TABS`
   array, one flow set, with one four-colour ternary between them.
2. **Nothing in the prototype is iBookit-specific except paint.** A better dock order, a client-first
   sale route, a dedicated payment history, a message route — none is a house-brand *fact*. If they
   are better, they are better for Forge and RED. The genuinely brand-shaped parts (plum, Hanken, the
   3×3 grid mark, the login choreography) are precisely what the token seam and the `loginAnimation`
   slot already carry, for free, forever.
3. **Per-brand structure buys nothing at runtime.** ADR-0008 and ADR-0012 already establish that
   tenant-resolved routes are dynamic by construction — no ISR, no CDN cache to fragment. The entire
   cost is source and test surface.
4. **This repo's guards point the wrong way for brand-shaped structure, and it knows what that costs**
   (`anon-read-surface.test.ts:12-21`: 27 days of undetected drift). A per-brand structural seam
   without a machine guard should be assumed to rot on that timescale.
5. **`typedRoutes: true` forecloses the middle path.** A route that exists for one brand must exist on
   disk for all of them. *(Reviewer correction: it is foreclosed at the cost of one blessed
   `as Route` cast — `asistencia.tsx:554-557` already does this deliberately, and `apps/client` four
   more times. Still a fine reason to reject C; not the hard gate it was first presented as.)*
6. **The lazy correct version is genuinely small** — the shell is already right and half the
   prototype's "new behaviour" already ships (§5).

---

## 5 · Paint vs re-flow — the practically useful split

**PAINT — the token seam already carries this at zero marginal cost per brand:** every colour on
every screen (33 tokens, light + dark), the logo/lockup, the favicon (`app/icon.tsx` serves the
module's `appIcon`), the app title and description, the full-screen login hero, and the default colour
scheme *(in the client app only — see §7.1)*. The login choreography drops straight into the existing
slot: `(auth)/login/page.tsx:17-26` is already `LoginHero ? <LoginHero name tagline="ADMINISTRADOR">{form}</LoginHero> : <StaticLogin>`,
and `static-login.test.ts:51-62` already loops `Object.values(brands)` to prove every registered hero
renders the form slot — one test, permanent coverage.

**PAINT-BUT-NOT-IN-CONTRACT:** typography only. See D2.

**ALREADY SHIPPED — do not rebuild:**

- The shell is already right: `(app)/layout.tsx` is a mobile-first phone-width column with a pinned
  `TabBar`. **Do not move screens out of `(app)`** — `layout.tsx:40-41` is the ONE staff gate
  (`getOperatorGyms` + `auditTenantInEffect`) for the whole group; moving a screen out silently drops
  both the gate and the tenant-crossing check.
- The dock is already data: `TABS` at `layout.tsx:14-22`. Reorder + relabel ASIST→PASE is a five-line
  edit; only the sliding pill and the loss of the raised `primary` treatment are a
  `packages/ui/src/forge/tab-bar.tsx` rewrite.
- `/inicio` 6-bucket renewal strip: `inicio.tsx:312 RenovarTile` + `:430 AunATiempoTile`.
- `/asistencia` CON RESERVA / SIN RESERVA split: `asistencia.tsx:594,599`. Its 104-day strip and
  5-minute kiosk tick are load-bearing invariants a re-skin must preserve.
- `/clientes/[id]/mensaje` is a route wrapper around an existing sheet: `MensajePicker`
  (`cliente-detalle.tsx:258-268`) + `packages/ui/src/forge/whatsapp-bubble.tsx`.
- `/clientes/[id]/historial` is a paginated view of an existing read: `cliente-detalle.tsx:493-518`.
- The kit already ships `sheet`, `toaster`, `input`, `icon`, `skeleton`, `count-up`,
  `whatsapp-bubble`, `use-flip`, `motion`.

**RE-FLOW — genuinely new, costs the same regardless of brand, ships once for all tenants:** the
`/inicio` EN CURSO live-class card; the dock pill/treatment rewrite; the `/vender` → `/clientes/nuevo`
rename with the `vender-vm` lift; the two thin new routes; **and deriving the iBookit dark scheme for
every new surface** (sheets, dock pill, WA bubble, toast) — reclassified from PAINT by reviewer
finding §7.1.

**Where the restyle leverage is:** four kit modules carry ~90% of the visible admin surface —
`forge/ui` (29 import sites), `forge/icon` (21), `forge/toaster` (17), `forge/sheet` (11). Two things
not to budget for: `Stat` (`ui.tsx:342`) is used by neither app; the ten `forge/agenda/*` modules are
consumed by ~one screen. *(Reviewer correction: confirm `session-card` and `fixtures` are not shared
before proposing any "move down".)*

**Two coupling traps invisible from either file alone:** `(app)/template.tsx:10`'s `forge-enter`
animation leaves a residual transform, which is *why* every `Sheet` portals to `document.body` —
changing the page-transition mechanism has non-obvious blast radius into all 13 Sheet call sites. And
`tools/guards/loading-coverage.test.ts:12-25` pins every `loading.tsx` by literal path **in both
directions**, so each new/renamed route needs a `loading.tsx` *and* a line in that array, in the same
commit, or `pnpm test` fails.

**A re-skin of the shared kit will NOT carry to `apps/client`.** It has 5 `@gym/ui` imports total, all
`skeleton` in `loading.tsx`. Tokens and the lockup propagate free; layout work does not. **The admin
restructure decision is independent of the client app's fate.**

---

## 6 · `/vender` — the ruling

> **`/vender` does not die and does not survive as-is. It is renamed to `/clientes/nuevo` and keeps
> every capability.**

The prototype screen (`prototipo-admin-v1.dc.html:274-306`) is today's `/vender` accordion in today's
order with the messy-desk half omitted: `← INICIO` · "Nuevo cliente" · NUEVO ⇄ EXISTENTE · NOMBRE /
TELÉFONO·OPCIONAL / CORREO·OPCIONAL · PLAN tiles · INICIO row with "Cambiar" · PAGO chips · Cobrar +
"VENCE 7 SEP · RECIBO E INVITACIÓN POR CORREO". **It is a happy-path comp, not a spec.**

**In order:**

1. **Lift `vender-vm.ts` FIRST — a compile-time blocker, not a design choice.** Five files outside
   `vender/` import it: `clientes/[id]/_components/pago-sheet.tsx:21`, `pago-sheet-vm.ts:9`,
   `pago-sheet-vm.test.ts:3` (three literal violations of `ARCHITECTURE.md:47`, "No screen imports
   another screen's `_components`"), plus `(app)/_components/paquete-tiles.tsx:7` and
   `(app)/_components/personalizado-editor.tsx:6` — already-lifted shared editors reaching back *up*
   into a screen folder. Move it to `(app)/_components/venta-vm.ts` beside them. *(This was the one
   claim a reviewer explicitly tried and failed to break; verified exactly as stated.)*
2. **Rename the route, preserve `?cliente=`.** Four of six inbound links carry a preselected client:
   `cliente-detalle.tsx:67` (RENOVAR / COBRAR PRIMERA COMPRA), `clientes.tsx:366` (row COBRAR),
   `asistencia/_components/marcadas.ts:187`, `agenda/_components/session-vm.ts:274`. The last two are
   **refusal-recovery bridges** — "this person needs a paquete" surfaced at the desk and in the class
   roster — and they dead-end if the target cannot preselect. `?cliente=` is a contract; the
   prototype's NUEVO⇄EXISTENTE toggle is its natural landing but describes no such contract.
3. **Keep the eight capabilities the prototype omits:** existing-client picker with diacritic-folded
   search; soft duplicate warn; hard RPC duplicate guard with USAR EXISTENTE / CREAR NUEVO; EXISTENTE
   email backfill (C7); primera-compra marker with stale guard; PERSONALIZADO sale; backdated fecha de
   inicio (30-day cap); per-attempt idempotency key.
4. **The recibo is a screen, not a caption.** The prototype compresses it into one line; today it is
   ~280 lines with three send rails — invite mail, receipt mail with REENVIAR and in-session address
   capture, and WhatsApp through the gym's plantillas — plus the brand ticket twin. Keep it as the
   post-Cobrar state of the same route.
5. **The payment-correction surface is not in scope and never was** (§1.2). It stays on the ficha.
   Whether it later migrates into `/clientes/[id]/historial` is a separate, optional call.

**Free win:** `packages/ui/src/forge/tab-bar.tsx:29` lights a tab via
`pathname === href || pathname.startsWith(href + "/")`, so `/vender` lights **no** tab today — the
visible symptom of a homeless route. `/clientes/nuevo` lights CLIENTES for nothing.

---

## 7 · Owner decisions

| # | Decision | Call | Why |
|---|---|---|---|
| **D1** | iBookit as a fourth brand module, or replace `base` as the neutral default? | **Ship as a fourth `ibookit` module, then flip `DEFAULT_BRAND` (`brand-id.ts:19`) to it in the same slice.** Keep `base` in the registry only as the fixture proving `loginAnimation` and `defaultScheme` are genuinely optional (`brand.test.ts:78-86`). | It decides what a gym with no brand of its own actually sees — today that is `base` plus a purple *demo* palette. Making the house theme the default turns it from a fourth skin into the platform's face. Both halves of the flip fail loudly if half-done (census tripwire `brand.test.ts:13`, DEFAULT_BRAND assertion `:20-26`). |
| **D2** | Typography into the token contract, or app-level for everyone? | **App-level. Swap `Outfit` → `Hanken_Grotesk` at `apps/admin/src/app/layout.tsx:12-16` for every tenant.** Do not widen `TOKEN_KEYS`. | Reviewer-corrected against the synthesizer's original recommendation. `TokenScheme` is a **total** `Record<TokenKey,string>` over two schemes (`tokens.ts:69`) and `tokens.test.ts` hand-pins 247 lines of literal CSS with no `-u` path, so every widening fans out across every module and fixture — O(brands), monotonically worse. A typeface key would also be a code-registered enum wearing a token's clothes (values must be faces `next/font` statically loads), establishing the precedent that a "token" can require a deploy — the exact property Option D is condemned for. Nobody has asked for a second face. **If the axis is ever added, batch every non-colour axis you expect (display face, body face, radius, motion scale) into ONE act.** |
| **D3** | Do the new dock and renamed sale route ship to Forge and RED too? | **Ship to everyone. One dock, one sale route, one structure.** | This is the actual ruling on question (c), and it is the owner's because it changes what a real operator's hands do — Forge is the only live operator (8:1 pasa-lista to ventas), and the change moves ASIST out of the raised primary slot, renames it PASE, and reorders the dock. Answering "no" **is** choosing Option D: a per-brand nav, the first slot, and the beginning of the multiplication. |
| **D4** | Rename `@gym/ui/forge/*`? | **After the re-flow, in one dedicated mechanical commit. Not now.** | It is a brand name on the brand-neutral kit and reads wrong forever once the house brand ships. Blast radius: 112 import lines across 37 files in `apps/admin/src`, 5 in `apps/client/src`, the `packages/ui/src/forge/` dir and its package.json exports, the `forge-*` CSS utility family (`forge-pressable`, `forge-hit`, `forge-scroll`, `forge-enter`, `forge-rise`, `forge-flash`, `forge-logout`), `forgeToast` (40+ call sites), and the sessionStorage key `"forge:cameFromApp"` (`lib/nav.ts:18`). Running it concurrently makes every conflict a rename conflict on top of a logic conflict. |

---

## 8 · What the adversarial pass found that outranks the original question

### 8.1 · Dark is NOT free in the admin — reclassify it as re-flow

`defaultScheme` has exactly **one** reader repo-wide: `apps/client/src/lib/brand.ts:35`. The admin
never reads it — `apps/admin/src/app/providers.tsx:27` hardcodes
`<ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>`, and
`packages/brand/src/registry.ts:127-130` says so outright: *"the admin app runs its own theme provider
(light + toggle) and never reads this field, so the desk is untouched."*

Making iBookit dark-first in the admin requires either wiring `defaultScheme` into next-themes'
`defaultTheme` (a new brand read in app code) or changing the admin default for all three brands.
`HANDOFF.md` §3 **Q6 ("the owner has never seen iBookit dark — get it on a screen early") remains the
one genuinely open question.** Budget: one line in `providers.tsx:27` + the dark token fill + deriving
dark for every new surface.

### 8.2 · The real divergence axis is CAPABILITY per gym, not identity per brand

There is **no** capability seam: no capability column on `gym`, no `gym_feature` table, and
`(app)/layout.tsx:14-22` is a static literal. Yet the repo's own research
(`apps/admin/src/app/(app)/asistencia/_components/prototype/NOTES.md:34-37,44-48`) documents Forge and
RED as *different operating shapes* — schedule vs no schedule — and calls class-less operation
**"a first-class feature, not a degraded mode."**

Rejecting brand-shaped slots is correct. But the re-flow as specified hard-codes the capability axis
away one more time. **The correction is a one-line addition to Option A, not a new option:** derive
`TABS` from what the tenant's data shows it does, computed in the same `AppLayout` server component
that already awaits `getOperatorGyms()` at `layout.tsx:40`. Still ONE structure, still zero brand
branches, still `typedRoutes`-safe (it can only hide routes that exist for everyone). That is the
difference between this re-flow lasting to gym #10 and being reopened at gym #4.

Precedent that this is the right shape: `/cuenta` already owns **seven** per-gym config sheets —
paquetes, coaches, class types, plantillas de WhatsApp, contenido público, identidad legal, mensajes
recibidos (`cuenta/_components/cuenta.tsx:32-38`, rows at `:179-223`) — plus per-gym timezone
(`vender/page.tsx:36`) and the monthly respaldo export. **Tenant customization already belongs in
rows, not code.** That is far more load-bearing for the owner's question than `token_overrides`.

### 8.3 · The per-gym LOGO path ADR-0012 promised was never built

`docs/adr/0012-host-brand-resolution.md:66` names *"per-gym palette/logo/copy becomes DATA on the gym
row"* as the literal thousands-scale mechanism. Palette and copy-name exist; **logo does not** — no
column in `packages/data/src/database.types.ts:701-714`, no storage migration anywhere in
`supabase/migrations/`, and `packages/brand/src/base/logo.tsx:28` is a hardcoded tile every generic
gym shares.

The honest ceiling sentence: **brand-as-data today reaches 33 colours and one display name; logo, icon
and typeface are code.** Option A's failure mode is not "a tenant needs a different flow" (no evidence)
— it is **"a tenant needs its own mark"** (every tenant will want this). Combined with §8.4 (modules
are never code-split, so the code-brand count must stay small), a per-gym logo/asset data path —
validated the way `token-overrides.ts` validates values — is the single highest-value architectural
item outside this worktree's scope.

### 8.4 · Wire the token overrides — but it is not a one-liner

The RLS/grant half is already done: `supabase/migrations/20260713190100_gym_anon_column_grants.sql:15`
includes `token_overrides` in the anon column grant, and `20260802120000` in the authenticated one. No
policy work needed. But budget it as *"extend the proxy's gym select to carry `token_overrides` through
the existing TTL cache and stamp it"*, not "one line". Doing it in the proxy inherits the 60 s cache and
keeps the root layout free of DB reads — which matters at thousands of tenants far more than line count.

Related hygiene: `apps/client/src/app/(home)/page.tsx:33-39` re-derives brand-from-header inline instead
of calling the shared `resolveBrand()`.

### 8.5 · Smaller traps found

- **`neon.css` is not client-only.** It is `@import`ed into the admin (`globals.css:12`) because the RED
  login hero (`red/login-hero.tsx:66,73`) uses its `.cm-sub`/`.cm-vals` classes, and
  `apps/admin/src/app/layout.tsx:62-65` documents that the admin must stamp `data-brand` for exactly
  that reason. Any shell restyle touching `<html>` attributes or globals import order can silently
  unstyle the RED admin login. **There is no test for it.**
- **The dock is conditionally suppressed.** `(app)/layout.tsx:44` — `const mostrarTabBar =
  decision.kind === "render"` — hides the TabBar on the `none` / `choose` / `redirect` arms
  (`SinGimnasio`, `VariosGimnasios`, the host redirect). A pinned dock rendered under `SinGimnasio`
  gives a locked-out user five dead tabs. The rewrite must preserve this.
- **Back-navigation breadcrumb.** `apps/admin/src/lib/nav.ts:18-37` is a one-shot read-and-clear
  sessionStorage flag (`"forge:cameFromApp"`) deciding whether the ficha back button calls
  `router.back()` or falls back to the roster. Adding two sub-routes under the ficha puts two more
  in-app hops under a mechanism designed for exactly one. They are **not** "thin route wrappers" in
  this respect.
- **No error boundaries anywhere.** Zero `error.tsx` / `not-found.tsx` / `global-error.tsx` under
  `apps/`; failure surfacing is entirely `forgeToast` in client components. Not a regression, but every
  new route inherits that posture and the prototype models no failure state either.
- **The prototype's `/cuenta` drops IDENTIDAD LEGAL** (`cuenta.tsx:219`, `LegalIdentitySheet` — itself
  a shipped gate item). Its summary card shows COBRADO + ventas; the real one is INGRESOS / VENTAS /
  **ASIST.** with prior-period deltas (`cuenta.tsx:286-303`). Dropping the ASIST. figure removes the
  single metric that matters for a gym running 8:1 pasa-lista to ventas — i.e. for the only live operator.
- **The ficha loses more than its historial.** Today: PRIMERA COMPRA PENDIENTE alert
  (`cliente-detalle.tsx:332-333`); a primera-compra-driven primary/secondary swap between ASISTENCIA
  and COBRAR (`:425-431`); an attendance toggle with an explicit undo arm (`:135`, control `:419-420`);
  an invitation-resend row (`:452-465`); swipe-back navigation (`:505-509`). The prototype folds
  WhatsApp + correo + invitación into one "Contactar" row (`:219`) and drops primera-compra entirely.
- **Domain wart.** The prototype's `/cuenta` names the product domain **`ibookit.mx`**. The locked
  platform domain is **`ibooki.lat`**. Fix before capturing this comp for marketing — which per D1 is
  the whole point of the house theme.
- **Brand-key reconciliation.** Cheapest fix consistent with repo doctrine: a `test:denial` suite
  assertion (or a migration-replaying guard) that every distinct `brand_module_id` in seeds maps to a
  registered module (§2, last bullet).

---

## 9 · Next steps, in order

1. **Produce the missing per-screen delta table** — read `prototipo-admin-v1.dc.html` end to end
   *including* the `DCLogic` block (line 428+), and mark every screen `paint` / `behaviour` / `new`
   against the component that renders it today. This is the one artifact §8 could not substitute for.
2. **Get iBookit dark on a screen** (HANDOFF Q6) before anything else is designed — it is now known to
   be admin-side work, not a token fill.
3. **Then plan.** Per `pipeline-earns-its-place`: ONE acceptance-criteria issue if it ships in one
   session; `/to-spec` → `/to-tickets` only if the pieces genuinely ship and verify independently.
   Candidate slice order: `vender-vm` lift → route rename + `loading.tsx` + guard line → iBookit brand
   module + DEFAULT_BRAND flip → typeface swap → dock rewrite → two thin routes → dark derivation.
4. **Out of scope but queued:** per-gym logo data path (§8.3), token-overrides wiring (§8.4),
   capability-derived dock (§8.2), brand-key reconciliation guard (§2).

---

## 10 · Rails (unchanged from HANDOFF §5)

- **No `git push` without the owner asking for that specific push.** Every push to `main` deploys both
  Vercel apps. Local commits are always fine.
- Pre-commit runs `pnpm lint && pnpm typecheck && pnpm test` (~80 s).
- Cross-package boundary is machine-enforced: `@gym/domain` / `@gym/format` / `@gym/data` ✗→
  `@gym/ui` / `apps/*`; `@gym/ui` ✗→ `@gym/data`; `@gym/brand` ✗→ `@gym/data` + `@gym/domain`.
- Brand modules are **presentation only** (ADR-0008).
- Any migration: `pnpm test:denial` green against a **scratch** project before fast-forward. Supabase
  MCP is bound to **LIVE**.
- Read `node_modules/next/dist/docs/` before writing Next.js code.
