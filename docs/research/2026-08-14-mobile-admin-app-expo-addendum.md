<!-- gap-fill addendum, generated 2026-08-14 -->

# Addendum — RN/Expo port of the admin app: the five closed gaps

## DECISIONS

| Decision | Recommendation | One-line basis |
|---|---|---|
| Data-access shape | **Option B: thin route handlers on `apps/admin` (`/api/movil/v1/*`), with supabase-js on device for AUTH ONLY** | The DAL is 7,975 LOC / 159 exports behind a `server-only` pill + React `cache` + `next/headers` in 33+19+2 modules; porting it means a second DAL frozen behind App Review, and 3 secret-holding modules force an HTTP surface anyway — so Option A never avoids building Option B [verified] |
| UI kit strategy | **Parallel `@gym/ui-native`; share domain + format + brand *tokens* + extracted view models only** | 954 `var(--token)` refs live in inline style objects that no sharing path (RNW/Tamagui/NativeWind/`.native.tsx`) reads; `@gym/ui` peers on `next`, `next-themes`, `react-dom`, `sonner` [verified] |
| Expo Router vs React Navigation | **Expo Router** | SDK 56 forked React Navigation out of `expo-router` — the two no longer interoperate, so React Navigation now means leaving Expo's tested path entirely [verified] |
| React in the pnpm catalog | **Do not diverge. `apps/mobile` uses `react: "catalog:"` (19.2.4) like everything else** | RN 0.86 peer is `^19.2.3`; 19.2.4 satisfies it. Only friction is `expo install --check` comparing against the exact pin — silence with `expo.install.exclude: ["react"]` [verified] |
| Apple enrollment | **Individual, web path, $99/yr, do it now. NOT blocked on hardware** | Enrollment "is available through the Apple Developer app* and on the web"; the app is mandatory only in India; the Touch ID/Face ID/T2 requirement is scoped to the *app-based* flow, not to enrollment [verified] |
| Auth / deep links | **`@supabase/supabase-js` `createClient` singleton + AsyncStorage + `processLock` + AppState listener. NO deep links in v1** | The admin app's only sign-in path is `signInWithPassword`; there is no `resetPasswordForEmail`, no magic link, no recovery route under `apps/admin` — the `/activar` + `send-email` machinery belongs to the client app [verified] |

Two of these carry a caveat that belongs in the decision, not a footnote:
- Option B's **latency and Vercel invocation cost are unmeasured**. A desk app doing pasa lista adds a device→Vercel→Supabase hop over a 19/19-under-50ms DAL baseline, and turns SSR-amortised reads into billable invocations. Measure with one throwaway route handler before committing. UNVERIFIED.
- The Apple decision assumes **EAS Build's hosted macOS workers satisfy Apple's upload requirement**. Apple documents only Xcode / Swift Playground / altool / Transporter, all macOS-only, and no web upload. One agent asserted the EAS path [verified] but cited `docs.expo.dev/guides/server-components/`, which does not support it; the SDK agent marked the same claim **UNVERIFIED**. Treat it as UNVERIFIED — it is the single highest-consequence unverified link in the whole Windows plan.

---

## 1. Code reuse

**Verdict: the rules and the data seam survive; the entire rendering layer does not.** ~44–60 solo-dev days (9–12 weeks) [inferred], of which 15–20 land before the first sector screen exists.

### Reuses as-is (~7,000 lines) [verified]

| Asset | Lines | Why it's free |
|---|---|---|
| `@gym/domain` | 2,142 | 6 modules, zero deps/peerDeps, zero react/next/DOM/node imports |
| `database.types.ts` | 1,875 | Full Row/Insert/Update + Args/Returns for all 52 RPCs |
| `@gym/data` pure carve-outs | 1,029 | `derive.ts` + `plantilla-ctx.ts` + `export/rows.ts` — the `PURE_EXEMPT` set the poison-pill guard already whitelists |
| admin view models | ~1,221 | session-vm 275, vender-vm 232, ticket-twin 188, marcadas 188, swipe 123, clientes-vm 109, recibo-envio 44, nav 38, paso-agenda 24 |
| `@gym/format` | 414 | Only `Intl` — **with one blocking risk, see below** |
| `@gym/brand` tokens | ~350 | `BrandTokens = { light/dark: Record<TokenKey,string> }` over 33 keys, values are `"#5b6698"` / `"rgba(...)"` — both RN-native. `tokensFor(module, overrides)` is ~20 lines |

The pleasant surprise is brand: **runtime per-tenant theming in RN is a half-day, not a rewrite.** Only `tokensToCss()` is web-specific.

### Sector sizing [inferred]

| Sector | Days | Driver |
|---|---|---|
| Foundation (before any screen) | 15–20 | Metro/EAS scaffold 2–3 · data layer + ADR 4–6 · auth + tenant resolution 2–3 · query cache replacing 35 `router.refresh()` 1–2 · RN UI kit 6–9 · theme runtime 0.5 |
| inicio | 2–3 | Easiest. 493 lines, 1 `useState`, read-only, no forms |
| clientes | 3–4 | `swipe.ts` (pure, tested) already isolates gestures; `useFlip` (getBoundingClientRect) has no RN analogue |
| asistencia | 5–7 | 956 lines, ~14 useState/useRef clusters, lazy month+day fetch with in-flight guards, optimistic `togglePase` + rollback. Concurrency at the door, not pixels |
| agenda | 6–8 | The `@gym/ui` agenda kit: editor-sheet 532, session-roster 344, wheel-picker 230 (snap physics needs re-tuning) |
| vender | 6–8 | 977-line money-path form, ~18 useState, plus the RECIBO whose perforation is `repeating-linear-gradient` |
| **cuenta** | **7–10** | **THE HARDEST.** 445-line hub over ~2,450 lines of CRUD in 11 sheets, 17-call `Promise.all`, 37 of the app's 56 server actions, 5 drag-reorder lists, and an XLSX export that cannot run on device |

**Your agenda hypothesis is wrong and the code says so.** `week-group.tsx:7-12`: *"The SEMANA view is a day-grouped agenda, never a time grid (PRD (f))"*. There is no día/semana time grid anywhere. The only month grids are `PaseCalendar` (asistencia) and `InicioCalendar` (vender), both simple 7-column day pickers. cuenta, not agenda, is the long pole. [verified]

### What does NOT transfer — blunt list [verified]

- **7,940 lines of admin client TSX + ~3,600 lines of `@gym/ui`.** Rebuilt from zero. Plus 689 lines of `loading.tsx` that simply cease to exist.
- **954 `var(--token)` references** (696 admin, 258 ui) inside inline `style={{ background: "var(--yellow)" }}` objects. RN has no CSS custom properties, no cascade, no class names. NativeWind's `vars()` only sees values its compiler parses from class strings — it never touches an inline style object, which is where 100% of this app's color lives.
- **11 `color-mix(in srgb, …)` calls.** No equivalent.
- **The inline-style shorthand layer:** 322 multi-value paddings (`"18px 20px"`), 209 border shorthands, 200 `background:` (7 of them gradients that break outright), 114 `cursor:`, 36 `transition:`, 20 `whiteSpace` + 10 `textOverflow` (→ `numberOfLines`), 9 `gridTemplateColumns`, 9 `animation:`, 8 scroll-snap, 3 `borderRadius:"50%"`. RN parses none of them.
- **685 `<div>`, 169 `<span>`, 107 `<button>`, 35 `<label>`, 6 `<input>`** — plus the tax people forget: every bare string literal must be wrapped in `<Text>` or RN throws at render.
- **`sheet.tsx`**, the most-used interaction primitive: 27 DOM calls (`createPortal` to `document.body`, `document.querySelector('main.forge-scroll')` scroll lock, `visualViewport` listeners, `transitionend`, `focus({preventScroll})`, Escape). In RN this file mostly **deletes** — Modal + KeyboardAvoidingView + Reanimated cover it. Rewrite smaller than the original.
- **`@gym/ui`'s framework neutrality is a lie:** peerDeps are `next`, `next-themes`, `react-dom`, `sonner`; `tab-bar.tsx` imports `next/link` + `next/navigation`, `theme-toggle.tsx` imports `next-themes`, both toasters import `sonner`. First RN import hits these.
- **Multi-tenancy has no port path** — it is new product surface. `(app)/layout.tsx:55-68` handles multi-gym staff by `redirect(https://${destino}${x-ruta})`. A binary has no hostname and cannot redirect to one. Budget 2–3 days for membership read → gym picker → persisted tenant-in-effect → in-app switcher, and expect it to touch every screen's query keys.
- **RSC / server actions are not a shortcut.** Expo's own docs mark RSC and Server Functions experimental, "production deployment is limited and not recommended yet", EAS Update incompatible. Port the 56 actions to direct calls — they average ~5 lines each (cuenta: 187 lines for 37 exports).

### What gets EASIER — bank it against the estimate [verified]

1. The entire soft-keyboard apparatus disappears (`viewport.ts` `keyboardInset`, `visualViewport` listeners, maxHeight-above-keyboard math, `onFieldFocus` scrollIntoView) — `KeyboardAvoidingView` replaces the lot.
2. **The app is already a native app wearing a browser**: `sm:max-w-[440px]`, one `<main>` scroller, pinned TabBar, per-screen enter animations. No desktop layout to throw away.
3. Tailwind usage is overwhelmingly layout — top 20 utilities are `flex`(310), `items-center`(175), `flex-col`(93) — all of which map onto Yoga defaults.
4. `icon.tsx`'s 37 hand-drawn glyphs are all `<svg viewBox="0 0 20 20"><path>` — near-mechanical rename to `react-native-svg`.
5. `FlatList` beats the hand-scrolled web roster.

### The one thing that could re-price everything

`packages/format/src/fecha.ts:19-23,66-70,99-124` does two-pass DST math with `new Intl.DateTimeFormat(..., { timeZone: tz })` + `formatToParts`. **Every Agenda write instant and every reader window bound flows through it.** Hermes' `IntlAPIs.md` lists `dayPeriod`/`fractionalSecondDigits`/`formatMatcher`/`numberingSystem` as gaps and is **silent on `timeZone`** — so this is **UNVERIFIED**, not confirmed working. Smoke-test on a real low-end Android device across API levels before writing a line of UI. Failure means `@formatjs/intl-datetimeformat` + tz data polyfills: bundle-size and correctness hit across all six sectors.

---

## 2. Data-access shape

### The premise in your brief is WRONG, and knowing that changes the argument

**Tenant isolation does NOT live in TypeScript. It is in RLS, verified against the live database.** All 32 public tables have `relrowsecurity = true`. The only policy in the entire database with a `true` qual is `gym_anon_select` on the public tenant directory. Every other policy keys on the row's own `gym_id` via `is_staff_of(gym_id)` / `is_member_of(gym_id)` / `auth.uid()`. A hostile device holding the publishable key and a valid session cannot read a gym it has no membership row for. The 54 `.eq("gym_id", …)` calls are documented in-code, repeatedly, as scope selectors and an index-plan fix — `gym.ts:88`: *"a scope selector, not a boundary — RLS stays the boundary (ADR-0001)"*. [verified]

So Option A (direct-Supabase) **would not move the tenant boundary onto the device**, and the security argument for a BFF does not exist. Option B wins on other grounds.

### LOUD — the boundary that IS in TypeScript

Two of them, and both matter more on mobile than on web:

1. **Staff-vs-socio is a TS-side filter.** `gym.ts:55`'s `.in("role", ["owner","operator"])` is the only thing keeping a socio's `member` row from winning the admin app (audit #19). Omit it in a mobile client and a socio enters the operator UI. RLS still denies clientes/ventas/asistencias/cobro, but `paquetes`, `perfil`, `coach`, `class_type` and `plantillas` are all `is_member_of` — so the socio sees the gym's catalog, coaches, class types and operator WhatsApp templates. **A real product-boundary leak caused purely by a TS-side omission.** [verified] Under Option B it stays server-side and cannot be omitted.

2. **`staff_gym()` is `order by gym_id limit 1`.** Ten write RPCs — including `registrar_venta` — derive the gym internally and take no gym parameter: `registrar_venta`, `create_class_session`, `edit_class_session`, `cancel_class_session`, `create_recurring_schedule`, `update_recurring_schedule`, `retire_recurring_schedule`, `ensure_week_materialized`, `crear_plantilla`, `sembrar_plantillas_default`. **A multi-gym operator's in-app gym picker will be INERT for all ten** — they always hit the lowest `gym_id`. This is the known multi-gym RPC roulette; neither option fixes it, both inherit it, and mobile surfaces it harder because there is no hostname to disambiguate. It needs a SQL fix (add `p_gym_id` + `is_staff_of` guard) **before a gym switcher ships**. [verified]

### Why Option B, concretely

| Axis | Option A (direct) | Option B (route handlers) |
|---|---|---|
| Port cost | Second DAL: 7,975 non-test LOC, 159 exports, 49 zod schemas, 38 wrapped RPCs, PostgREST 1000-row pagination, N+1 rewrites, typed error translation — abandoning 11,302 LOC of tests for the mobile surface | ~25–40 handlers × 15–30 LOC + a `createClientFromBearer` (~30 LOC) + a `gymId` param + a proxy exclusion ≈ 700–1,200 LOC of glue, zero duplicated logic [inferred] |
| Metro feasibility | Three independent hard stops: 33 modules open `import "server-only"` (default condition throws unconditionally), 19 import React `cache` (Server-Components-only per react.dev), 2 import `next/headers` [verified] | Untouched |
| ADR-0011 | Erodes it — sharing any DAL module with Metro requires stripping the `server-only` pill or adding the build step §1 explicitly forbids ("load-bearing for security … a pre-built package could strip the directive") | Preserves it exactly — route handlers are just more Next callers, precedent already exists at `cuenta/respaldo/route.ts` |
| Completeness | Impossible anyway: `invitaciones.ts` needs `RESEND_API_KEY`, `activacion.ts`/`registro.ts` need `TENANT_ASSERTION_KEY`. Option A reduces Option B's endpoint count; it does not avoid Option B | — |
| Hotfixability | A wrong lifecycle verdict / backdate bound / tz derivation is **frozen in a shipped binary until App Review clears** | Every rule change ships from Vercel |

**Say it plainly: Option B is not a security win.** The device still holds the publishable key and a valid session and can always reach PostgREST directly. RLS is the boundary either way. The decisive argument is hotfixability plus not building a second DAL.

**The proposed hybrid (direct reads, RPC-only writes) is the worst of the three splits for this codebase.** Writes are already RPC-only and already self-scoping, so that half is free under either option; reads are where the ~8k LOC of composition lives (`derive.ts`, `ocupacion`, `resumen`, respaldo pagination, aggregate-RPC fan-outs). That hybrid re-implements the expensive half and reuses the cheap half. **The split that IS load-bearing is auth-direct / data-over-HTTP.** [inferred]

### Contradiction between agents, stated plainly

The code-reuse auditor concluded a device-side Supabase client hitting the same 55 `.rpc()` / 145 `.from()` sites is *"a legitimate architecture — no BFF needed"* [verified], and priced an isomorphic data layer at 4–6 days. The data-access investigator concluded the opposite. They do not disagree on any fact — both agree RLS is the real boundary and both agree the DAL cannot be imported by Metro as-is. They disagree on whether de-poisoning 6,900 lines (4–6d, plus an ADR amendment, plus a fork of the tenant-scoping and role-filter logic) beats writing 700–1,200 LOC of glue. **Take Option B**: it is cheaper on the numbers, it doesn't require amending an ADR whose stated rationale is security, and it keeps the socio filter and the rule engine on a surface you can hotfix.

### Option B's non-obvious obligations

- **Version the surface from commit one: `/api/movil/v1/`.** `apps/admin` and `@gym/data` currently deploy atomically, so DTO shapes have never been versioned. A shipped binary breaks that. Add a minimum-app-version check. [inferred]
- **Do not reuse the header name `x-gym`** — `tenantHeaders()` deliberately deletes inbound `x-gym` so that header is guaranteed proxy-derived.
- **Add a `gymId` param to `getOperatorGym`**, validated against `getOperatorGyms()`. `gym.ts:91-97` currently picks via `slugDelHost()`, null on native — and the fallback `gyms[0]` already exists, so the mobile shape is a small edit, not a redesign.
- **Exclude API routes from `proxy.ts`'s `decideRedirect`** or they bounce to `/login`.
- `@gym/domain` and `@gym/format` are Metro-safe and should be consumed directly under either option; depcruise permits `apps → packages`. [verified]
- Unguarded `p_gym_id` aggregate RPCs are safe against a hostile device — they are `security invoker`, so passing another gym's id returns an empty set. Stated as deliberate posture in the migration. [verified]
- **Gap:** the 24 `SECURITY DEFINER` functions were not individually swept for parameter-injection. Three spot-checks (`toggle_favorito_tipo`, `mi_membresia`, `roster_clase`) self-scope. A full sweep is worth doing before *any* option ships — a definer hole is equally exploitable from the web today.

---

## 3. Supabase Auth in Expo — code-level

**Do not reuse `@gym/data/client`.** It is `@supabase/ssr`'s `createBrowserClient` with `cookieOptions`; its storage is built behind an `isBrowser()` guard and reads/writes `document.cookie`. Hermes cannot run it. Build a separate factory on `@supabase/supabase-js` (already in the catalog at `^2.106.2`). [verified]

Copy Supabase's own RN example verbatim:

```ts
import 'react-native-url-polyfill/auto'      // load-bearing: new URL() is unreliable without it
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, processLock } from '@supabase/supabase-js'
import { AppState, Platform } from 'react-native'

export const supabase = createClient(url, publishableKey, {
  auth: {
    ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
})

// "This should only be registered once." — MANDATORY, not cosmetic.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    state === 'active' ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh()
  })
}
```

The AppState listener is mandatory because auth-js's `isBrowser()` is `typeof window !== 'undefined' && typeof document !== 'undefined'` — false on RN — so `_handleVisibilityChange()` takes the branch that just calls `startAutoRefresh()` and returns. **The 30s ticker then runs continuously, including while backgrounded, unless you stop it.** [verified]

### Sharp edges, all [verified]

| Edge | Detail | Fix |
|---|---|---|
| `signOut()` kills the front desk | Signature is `signOut(options = { scope: 'global' })` — the default terminates ALL of the user's sessions. An operator tapping Cerrar sesión on the phone logs out the admin web app at the desk | `signOut({ scope: 'local' })` |
| Duplicate clients are silent on RN | The "Multiple GoTrueClient instances detected" warning is gated on `isBrowser()`. Two clients sharing a storage key fight over the refresh token with **no console output** | One module-level singleton |
| PKCE silently downgrades | `generatePKCEChallenge` checks `crypto.subtle` + `TextEncoder`; on failure logs "WebCrypto API is not supported… default to use plain" and `codeChallengeMethod = 'plain'`. Hermes ships no `crypto.subtle` | Moot in v1 — auth-js `DEFAULT_OPTIONS` is `flowType: 'implicit'` and password sign-in doesn't use PKCE |
| `getClaims()` does not port | It falls back to a network `getUser()` call whenever `crypto.subtle` is absent — i.e. always, on Hermes. **The entire `@gym/data/server` tier gates on `getClaims`** (`proxy.ts:78`, `_auth.ts:19`); that pattern does not transfer. Every gate becomes a round-trip and fails offline | Gate on `onAuthStateChange` events |
| Silent logout on cold start | `_recoverAndRefresh` wraps everything in `try {…} catch (err) { console.error(err); return }`. A throwing storage adapter boots with no session and only a `console.error`. Triggers: Android Auto Backup restoring AsyncStorage ciphertext without the Keystore-bound key; iOS Keychain surviving a reinstall that wiped AsyncStorage | Plain AsyncStorage avoids the whole class |
| Refresh rotation race | A refresh token is single-use (10s reuse interval + parent exception); outside those, "the whole session is regarded as terminated". Defended by `refreshingDeferred` + the lock | `lock: processLock` — this is why the official example passes it |

**Offline expiry is already correct — do not fight it.** A failed fetch throws `AuthRetryableFetchError`, as do 502/503/504; `_recoverAndRefresh` and `_callRefreshToken` only `_removeSession()` when `!isAuthRetryableFetchError(error)`. Network-down keeps the session; a genuine 400/401 wipes it and emits `SIGNED_OUT`. Let `getSession()` (a pure local read) drive the UI. [verified]

### Storage: AsyncStorage, not SecureStore

Supabase's own RN quickstart uses plain AsyncStorage; SecureStore is an opt-in hardening tab. Supabase's Expo tutorial states the 2048-byte SecureStore limit as fact and works around it with a `LargeSecureStore` AES class (`aes-js` + `react-native-get-random-values` + `expo-secure-store`); **Expo's current doc has softened this** to "Large payloads can be rejected by the underlying platform… Expo does not enforce a limit" — a platform-dependent rejection, not a hard cap. A real session (access_token JWT + refresh_token + full `user` with `app_metadata`, `user_metadata`, `identities[]`) realistically exceeds 2048 [inferred]. If you want SecureStore, the supported path without AES is the `userStorage` option, which splits the bulky user object into `storageKey + '-user'`. **Measure `JSON.stringify(session).length` on a real operator login before choosing.** [verified/gap]

### Deep links: not needed in v1, and the wrong instinct if you add them

The admin app's only sign-in is `login-form.tsx:58` `signInWithPassword`. No `resetPasswordForEmail`, no magic link, no recovery route anywhere under `apps/admin`. `/activar`, `/auth/confirm` and the branded `send-email` hook all serve the **client** app. So the deep-link problem evaporates for the port you are doing. [verified]

If you ever do want auth mail to open the app: **do not switch `redirect_to` to a custom scheme.** `send-email/index.ts:41-66` derives branding by doing `new URL(redirectTo).hostname → gym_id_por_host(hostname,'client') → gym.brand_name`. An `ibookit://auth/confirm` URL parses (hostname becomes `auth`), resolves no gym, and the mail **silently degrades to the neutral "Notificaciones" sender.** Keep `redirect_to` on `https://{gym-host}/auth/confirm?…` and host AASA/assetlinks per gym host. Helpfully, the mail already uses the `token_hash` + `type` recipe (`correo.ts:37-45`), which is exactly what native `verifyOtp({token_hash, type})` consumes — and `verifyOtp` has no same-device constraint, unlike `?code=` (PKCE codes are 5-minute, single-use, same-device-only). [verified]

Universal Links do not scale across per-gym custom domains without an `apple-app-site-association` and `assetlinks.json` on **each** domain. [verified]

### Navigation gating

Subscribe to `onAuthStateChange`, not a bare `getSession()` race — auth-js guarantees an `INITIAL_SESSION` event to every new subscriber after `initializePromise` resolves, so that is your "auth has booted" signal. Hold the splash until it arrives. Expo Router SDK 53+ uses declarative `<Stack.Protected guard={!!session}>`, not imperative redirects. [verified]

---

## 4. Expo SDK and router facts

**The prior pass was one SDK stale.** Current is **SDK 57, published June 30 2026**: RN **0.86**, React **19.2.3**, react-native-web 0.21.0, **min Node 22.13.x**. Changelog: *"a small, focused release… React Native 0.86 is intended to have no breaking changes from 0.85."* The prior pass's only correct claim was the architecture one. [verified]

- **New Architecture is mandatory and non-disableable since SDK 55** (RN 0.82+). SDK 54 was the last with `newArchEnabled: false`. Legacy was frozen June 2025. [verified]
- **CORRECTION: Expo Router is no longer built on React Navigation.** SDK 56 forked it: *"Now that `expo-router` no longer depends on `react-navigation`, most code imported directly from `@react-navigation/*` packages will no longer work out of the box alongside `expo-router`."* `expo-router@57.0.13` has **zero** `@react-navigation/*` entries; it depends on `standard-navigation@^0.0.5` + `react-native-screens@^4.26.0`. Codemod: `npx expo-codemod sdk-56-expo-router-react-navigation-replace`. [verified]
  - Real costs, not hypothetical: typed routes are **still beta and opt-in** (`experiments.typedRoutes`, doc dated Feb 28 2026, no relative paths, no query-param typing — re-check at scaffold time, **gap**); the dep tree is heavy for 6 screens (`@expo/ui`, two `@radix-ui` packages, `vaul`, and `@testing-library/jest-dom` + `user-event` as *runtime* deps); and **`standard-navigation` is at version 0.0.5** and is expo-router 57's entire navigation core — worth a look before committing. **UNVERIFIED** what it is or how stable.

### React version — resolved, and the "blocker" mostly isn't one

`react-native@0.86.0` peers on `"react": "^19.2.3"`; `expo` and `expo-router` both declare `"react": "*"`; `next@16.2.6` accepts `^19.0.0`. **The repo's catalog `19.2.4` satisfies all three.** [verified, confirmed against `pnpm-workspace.yaml` and root `package.json` in this session]

`tools/guards/manifests.test.ts:69-80` asserts every manifest in `apps/*` and `packages/*` pins `react` as the literal string `"catalog:"`, and it runs in `pnpm test` → pre-commit. The SDK agent flagged this as a blocker; **given the "don't diverge" recommendation it is not one** — `apps/mobile` writes `"react": "catalog:"` like everything else and the guard passes untouched. It only becomes a blocker if you decide to diverge, which you shouldn't. (Note also that guard's `type:module` / `private:true` assertion iterates `packages/*` only, so an Expo app in `apps/mobile` is not forced to ESM.)

The only friction is `npx expo install --check`: its logic is `semver.satisfies(actual, expected)` where Expo's expected value for react is the exact string `19.2.3`, so 19.2.4 fails and exits non-zero in CI. Documented escape hatch: `"expo": { "install": { "exclude": ["react"] } }`. Whether `react` even reaches that code path is **INFERRED** — resolve by scaffolding and running it once. [verified/gap]

**REPO BLOCKER that is real:** `packages/data` declares `peerDependencies: { next: "catalog:", react: "catalog:" }` (confirmed in this session). `apps/mobile` cannot consume `@gym/data` without dragging a `next` peer, and 34 of its 37 exports are `./server/*` behind the poison pill. `@gym/ui` is worse (next, next-themes, react-dom, sonner). Only `@gym/domain` and `@gym/format` are peer-free. **Under Option B this is moot** — mobile consumes domain + format + HTTP, never `@gym/data`. Under Option A it would force splitting the browser seam into a new package. Another point for B.

### Monorepo, Node, Windows

- **Metro needs no hand-config.** Expo has configured Metro for monorepos since SDK 52 — if you set `watchFolders` / `nodeModulesPath` / `extraNodeModules` / `disableHierarchicalLookup`, delete them and `--clear`. **"From SDK 54, Expo supports isolated dependencies and isolated installations"** — pnpm's default linker is supported. SDK 57 added on-demand filesystem crawling (default on) which "allows symlinks to be resolved outside of your monorepo root… adds Global Virtual Store support in package managers such as Bun and pnpm". Escape hatch if native builds misbehave: `nodeLinker: hoisted`. [verified]
  - **Still UNVERIFIED against a running build:** whether Metro resolves *this* repo's raw-TypeScript packages with subpath `exports` maps (`@gym/domain/rules`) under pnpm's isolated layout. `unstable_enablePackageExports` may be needed. ADR-0011 forbids adding a build step, so Metro must transpile `packages/*/src/*.ts` directly. **This is spike item #2.**
- **Node:** repo's `>=22.13 <25` is compatible with SDK 57's 22.13.x minimum, but RN 0.86's own engines are `^20.19.4 || ^22.13.0 || ^24.3.0 || >= 25.0.0` — excluding 23.x and 24.0–24.2, which the repo's range permits. Tighten to `>=22.13 <23 || >=24.3 <25`. [verified]
- **Windows MAX_PATH bites LOCAL Android builds, not Metro.** Confirmed live case: `react-native-screens` (an expo-router hard dep) fails the Android CMake/Ninja compile with "Filename longer than 260 characters" on the nested Prefab/.cxx path, typically on the *second* build. Mitigate with `LongPathsEnabled`, a short checkout, or **build on EAS instead of `npx expo run:android`**. Whether it's fixed in `^4.26.0` is **UNVERIFIED**. [verified]
- Expo's Windows troubleshooting page is cmd.exe syntax (`del %localappdata%\Temp\metro-cache`) — in PowerShell use `$env:LOCALAPPDATA`; the `watchman watch-del-all` step is a no-op on Windows. No Expo page documents Windows MAX_PATH, EPERM, symlinks, file-watching, or WSL. The "Defender holds file handles → EBUSY" claim is blog-sourced, **UNVERIFIED**. [verified]
- **The free Expo Go iPhone path is gone:** *"To install Expo Go on your iOS device, you will need an active subscription to the Apple Developer Program"* — you build it yourself with `npx eas-cli@latest go`. Android Expo Go is still a plain Play Store download. **The $99 is required before the incoming iPhone can run anything at all.** [verified]
- **Data fetching:** Expo recommends TanStack Query (2026 stack blog; devtools plugin shipped in expo/dev-plugins). Supabase's Expo guide prescribes no state library. Convention: Supabase supplies client + session, TanStack supplies cache. This is the replacement for the 35 `router.refresh()` sites. Expo Router's `createStaticLoader`/`useLoaderData` (SDK 56) are web/SSR-oriented, **not** the native data path. [verified]

---

## 5. Apple enrollment

**Not blocked on hardware. Enroll individually, on the web, now.** The prior pass's contradiction was a citation error.

- *"Enrollment in the Apple Developer Program is available through the Apple Developer app\* and on the web."* The footnote: *"\* Enrollment in India is only available through the Apple Developer app."* Mexico is not India. [verified]
- **The Touch ID / Face ID / T2 sentence is not on the identity-verification page at all.** It appears three times on the *Apple Developer app* page and is a prerequisite for using **the app**, not for enrolling. The investigator grepped raw HTML of all four candidate pages; the prior pass's quoted *"No specific device is required to enroll"* is likewise **not currently published anywhere** — its substance is correct for the web path but the quote is not sourceable. [verified]
- Device-bound in-app identity verification is scoped to named exceptions (China-mainland Account Holders, Account Holder transfers, Enterprise Program) and even there Apple publishes an escape hatch: *"To verify using a method other than the Apple Developer app, contact support."* The photo-ID step has its own fallback (footnote 2). [verified]
- **2FA is not the trap.** Web setup at `account.apple.com` → Upgrade Account Security. *"If you don't have a trusted device handy, you can have a verification code sent to your trusted phone number as a text message or phone call."* *"To use two-factor authentication, you need at least one trusted phone number on file"* — a trusted **device** is never stated as required. Mexico is on Apple's 2FA country-code list. [verified]

**Individual, not organization.** Org enrollment demands a D-U-N-S Number, a work email on the org's own domain, a publicly functional website on that domain, a binding-authority reference, possibly notarized documents — and orgs must wait for Apple Developer Support before they can even pay, while individuals purchase immediately. Cost is 99 USD/yr, and on the web path **you must pay with your own credit card** or enrollment is delayed pending photo ID. [verified]

Two consequences to accept up front:
- **The App Store seller will read as your personal legal name**, not "iBookit". *"To have your organization's name appear as the seller, your organization must be recognized as a legal entity and you must be enrolled as an organization."* [verified]
- Apple does **not** require an entity merely because third-party businesses use your app. The only published legal-entity mandate is **5.1.1(ix)**, scoped to banking/financial services, healthcare, gambling, legal cannabis, air travel, crypto exchanges — *"or that require sensitive user information"*. Gym/class management is not on the list; whether member rosters + attendance + payment history trip the fuzzy clause is a judgment call with **no published Apple precedent. UNVERIFIED risk, not a documented bar.** [verified/gap]

**Guideline 4.2.6 explicitly blesses your design** and would reject the alternative: *"Another acceptable option for template providers is to create a single binary to host all client content in an aggregated or 'picker' model."* One neutral binary theming per tenant is the compliant shape; per-gym cloned apps is the rejected one. [verified]

Operational facts worth planning against:
- **Screenshots do not need a real device.** The spec page constrains only format, pixel dimensions and alpha channel. 2.3.3 requires only that they "show the app in use"; 2.3.9 says to *"display fictional account information instead of data from a real person"* — which actively favours seeded renders. Ship one size: the 6.9" iPhone (1290×2796), and *"If your app's user interface is the same across multiple device sizes… provide only the highest resolution screenshots required. They automatically scale down."* iPad sizes are required only if the app runs on iPad. [inferred/verified]
- **App Review: "90% of submissions are reviewed in less than 24 hours."** Top rejection cause is 2.1 App Completeness (>40% of unresolved issues). [verified]
- **Beta App Review has NO Apple-published turnaround.** Any "24–48h" figure you have seen is blog-sourced. TestFlight external testing requires a first build already approved by App Review. [verified]
- **A seeded demo gym account is mandatory, not optional** — *"If some features require signing in, provide a valid demo account username and password."* For a multi-tenant app whose tenant resolves from membership rows after login, be ready with a video too.
- **Enrollment approval has no published SLA.** The only number is a 24-hour post-purchase confirmation backstop. Whether a Mexican INE is accepted on the web/support path is **UNVERIFIED**.
- **The real Windows chokepoint is the upload, not the enrollment:** *"you can upload a build using Xcode, Swift Playground, altool, or Transporter"* — all macOS-only, no web upload documented. Hence the EAS dependency above.
- **Gap not researched:** the free-app path's App Store Connect agreements and Mexico tax forms. That is the next thing that can silently block a first submission.

---

## What this changes about the plan

The original week 1 was: attempt Apple enrollment day 1, spike `apps/mobile` + `eas build` on Android, re-run the missing research, do all UI work on Android. Three of those four survive with different content.

**1. Enrollment day 1 — keep, but decouple it and change its shape.** It is an *individual* web enrollment with your own credit card, ~15 minutes, and it is **not a gate on anything except running code on the iPhone**. Stop treating it as a risk item. Do it day 1 because the $99 is a hard prerequisite for iOS Expo Go and because approval has no published SLA — not because anything else waits on it. Accept the personal-name seller line now; revisit only if the incorporation happens for CFDI reasons anyway.

**2. The day-1 spike is no longer "eas build" — it is three smoke tests, in this order, before any UI exists.** All three can re-price or invalidate the port and all three are cheap:
   - **(a) Hermes `Intl.DateTimeFormat` with `{ timeZone: "America/Mexico_City" }` + `formatToParts`, on a real low-end Android device.** This is the highest-consequence unknown in the entire project — `fecha.ts`'s two-pass DST math underpins every Agenda write and every reader window. Failure means `@formatjs` polyfills across all six sectors.
   - **(b) Metro resolving `@gym/domain/rules` (raw `.ts` behind a subpath `exports` map, pnpm isolated linker, ADR-0011 forbids a build step).** Throwaway Expo app, import it, run one of its test suites' logic on-device. If this fails the whole "share the pure packages" premise fails.
   - **(c) `console.log(typeof globalThis.crypto?.subtle)` in a dev build.** Confirms the PKCE-plain and getClaims-network findings, which are inferred from source absence, not from a doc.
   
   `eas build` on Android moves *after* these — and note that MAX_PATH argues for building on EAS rather than `npx expo run:android` regardless.

**3. "Re-run the missing research" is done — replace it with two measurements and one SQL fix.**
   - Measure **route-handler latency** device → Vercel → Supabase with one throwaway endpoint. This is the only number that could overturn the Option B verdict, and it matters most at the door during pasa lista.
   - Measure **`JSON.stringify(session).length`** on a real operator login, to settle AsyncStorage vs `userStorage` vs LargeSecureStore.
   - Ship the **`staff_gym()` `p_gym_id` + `is_staff_of` fix** as a migration. Ten write RPCs — including `registrar_venta` — ignore any gym picker you build until this lands. It is a prerequisite for the multi-gym story, not a follow-up, and it is fixable today independent of the port.

**4. "All UI work on Android" survives and is correct — but UI is not week 1.** Foundation is 15–20 days before the first sector screen exists, and the biggest single piece of it (`@gym/ui-native`, 6–9 days) is now a confirmed *rebuild*, not a port. Sequence the sectors easiest-first for velocity feedback: inicio → clientes → asistencia → agenda → vender → **cuenta last** (it is the 7–10 day sector, not agenda, and it has a hard carve-out: `/cuenta/respaldo`'s exceljs XLSX cannot run on device and stays a server endpoint the app opens or shares).

**5. Two decisions that did not exist in the original plan and must be made in week 1.**
   - **`/api/movil/v1/` versioning + a minimum-app-version check, from the first commit.** `apps/admin` and `@gym/data` have never been versioned against each other because they deploy atomically; a shipped binary permanently ends that.
   - **Offline scope, explicitly.** Nothing in any estimate covers it. The web app assumes connectivity on every read. A gym-desk app that must pasa lista through an internet outage is a different product with a local write queue. Decide in or out before starting, not at week 6.

**6. One thing to stop worrying about and one to start.** Stop worrying about the React version — one catalog at 19.2.4 satisfies RN, Expo and Next; the manifests guard passes untouched as long as you don't diverge. Start worrying about **EAS Build's hosted macOS workers satisfying Apple's Xcode/altool/Transporter-only upload requirement**: it is UNVERIFIED against a primary source, the two agents who touched it disagreed, and it is the load-bearing assumption of the entire Mac-less plan. Verify it against Expo's own EAS Build docs before the first sector screen, not after.