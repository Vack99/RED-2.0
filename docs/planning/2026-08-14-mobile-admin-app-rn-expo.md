# Mobile admin app — React Native + Expo

**Date:** 2026-08-14
**Scope:** `apps/admin` only (the gym operator's app). `apps/client` is explicitly out of scope.
**Status:** analysis complete, decisions recommended, nothing built yet.

**Provenance.** Two research passes, 16 agents, primary sources only:
- `docs/research/2026-08-14-mobile-admin-app-expo.md` — the main report (Mac-less iOS path, Mac rental economics, Metro/pnpm integration, tenancy, deploy model, alternatives).
- `docs/research/2026-08-14-mobile-admin-app-expo-addendum.md` — closes the four gaps the first pass left (code-reuse sizing, data-access shape, Supabase Auth in Expo, Apple enrollment hardware).

Claims below carry the confidence marker from the research: **[verified]** = quoted from a primary source, **[inferred]** = reasoned from evidence, **[unverified]** = could not be confirmed. Unverified things stay unverified — they are listed in §11 as the items that could change this plan.

---

## 1. The short answer

**You can start today. On Windows. With no Apple hardware at all.**

Apple's cloud-build ecosystem has moved far enough that a Mac is no longer part of the ship path. Expo's EAS Build compiles iOS on Expo's own hosted macOS virtual machines; EAS generates and stores the signing certificate and provisioning profile server-side, so there is no Keychain to touch; and EAS Submit uploads to App Store Connect from Windows. Apple Developer Program enrollment is a web form.

What no Mac costs you is not the ability to *ship* — it is the ability to *see*. Without a Mac there is no iOS Simulator, so until the iPhone arrives your iOS feedback loop is builds and logs, not pixels. The iPhone, not the Mac, is what closes that loop. **Do not rent or buy a Mac.**

The mobile app **belongs in this monorepo** as `apps/mobile`, and you keep pnpm's isolated linker (the thing backstopping your dependency boundary). Expo has supported isolated installs as a first-class strategy since SDK 54.

But hosting does **not** work like the Vercel apps, and that difference is structural, not cosmetic — see §3.

The honest cost is **44–60 solo-dev days** (9–12 weeks with AI agents), of which **15–20 days is foundation before the first sector screen exists**. This is a rebuild of the entire rendering layer, not a port. The business rules and the data seam survive; nothing you can see survives.

---

## 2. The Mac question, answered properly

Most guidance conflates "you need a Mac" with "you need an iPhone." They are different constraints and they bite at different moments.

### Doable today, Windows only, zero Apple hardware

| Step | Status |
|---|---|
| Apple Developer Program enrollment, $99/yr individual | Web form. *"Enrollment in the Apple Developer Program is available through the Apple Developer app\* and on the web."* The footnote: *"\* Enrollment in India is only available through the Apple Developer app."* Mexico is not India. **[verified]** |
| Apple ID two-factor auth | Works via SMS/call to a trusted phone number. *"If you don't have a trusted device handy, you can have a verification code sent to your trusted phone number."* A trusted *device* is never stated as required. **[verified]** |
| Signing certificate + provisioning profile | EAS generates and stores them server-side; the build VM creates a temporary keychain, imports the cert, places the profile. No local Keychain. **[verified]** |
| Compiling the `.ipa` | EAS *"create[s] a new macOS VM for the build"* with Xcode and Fastlane preinstalled. **[verified]** |
| Uploading to App Store Connect | EAS Submit. *"EAS Submit works on macOS, Linux, and Windows, so you don't need a Mac to ship iOS builds."* **[verified]** |
| TestFlight setup, App Store Connect config | Browser. Internal testing = up to 100 team members with no Beta App Review. **[verified]** |
| APNs push key | `eas credentials` generates it. Needs the paid account, not a Mac. **[verified]** |
| App Store screenshots | Do **not** need a real device. The spec constrains only format, pixel dimensions and alpha channel; guideline 2.3.9 actively prefers *"fictional account information instead of data from a real person"*, which favours seeded renders. Ship one size — 6.9" iPhone, 1290×2796 — and Apple scales it down. **[verified/inferred]** |

### The earlier scare, resolved

An earlier pass found what looked like a contradiction: one Apple page says no device is required to enroll, another reportedly demands Touch ID / Face ID / a T2 Mac. **It was a citation error.** The Touch ID/Face ID sentence appears on the *Apple Developer app* page — it is a prerequisite for using **the app**, not for enrolling. Device-bound in-app identity verification is scoped to named exceptions (China-mainland Account Holders, Account Holder transfers, the Enterprise Program), and even there Apple publishes an escape hatch: *"To verify using a method other than the Apple Developer app, contact support."* **[verified]**

### What genuinely requires each piece of hardware

- **Needs a Mac:** local Xcode compiles, the iOS Simulator, cabled on-device debugging. **None of these are on the ship path.**
- **Needs an iPhone:** seeing and touching the app on iOS. There is no substitute without a Mac, because there is no Simulator to fall back on.
- **Needs the $99 account before the iPhone is useful at all:** *"To install Expo Go on your iOS device, you will need an active subscription to the Apple Developer Program"* — you now build Expo Go yourself with `npx eas-cli@latest go`. Android's Expo Go is still a plain Play Store download. **[verified]**

### Why not rent a Mac

A rented Mac genuinely does give full interactive iteration via remote desktop + Simulator, so this is a spend decision, not a capability one — reversible in an afternoon.

| Option | 2026 price | Verdict |
|---|---|---|
| Scaleway Mac mini M1 | €0.11/hr ≈ €75/mo **[verified]** | Cheapest interactive option |
| MacStadium Mac mini M2.S | $109/mo **[verified]** | Bare metal, root access |
| MacinCloud dedicated | ~$99/mo M2 **[unverified — canonical pricing URL 404s]** | — |
| AWS EC2 Mac | Dedicated Hosts, **mandatory 24-hour minimum allocation** per Apple's macOS license **[verified]** | Worst fit for short sessions |
| GitHub Actions macOS | $0.062/min = **10.3× Linux** **[verified]** | CI only, never a UI |
| Used Mac mini M2 | ~$349–429 **[unverified — secondary market; Apple's refurb store showed zero inventory]** | Break-even vs rental at 3–5 months |

**The recommendation is neither.** EAS Build covers the entire pipeline; the only missing capability is seeing the app, and the arriving iPhone solves that at zero recurring cost. Buy Scaleway hours (€0.11/hr) or a ~$400 used mini only if the iPhone slips badly or an iOS-only visual bug appears that you cannot reproduce on Android.

**Contingency if the iPhone slips:** the only substitute is a browser device farm (BrowserStack App Live, AWS Device Farm), and **nobody verified whether a farm can install an ad-hoc / dev-client `.ipa`** rather than only TestFlight/production builds. Answer that before betting on it.

### Individual vs Organization enrollment

**Enroll as an individual.** Organization enrollment demands a D-U-N-S Number, a work email on the org's own domain, a publicly functional website on that domain, a binding-authority reference, and possibly notarized documents — and organizations must wait for Apple Developer Support before they can even pay, while individuals purchase immediately. **[verified]**

Two consequences to accept up front:

1. **The App Store seller name will read as your personal legal name**, not "iBookit." *"To have your organization's name appear as the seller, your organization must be recognized as a legal entity and you must be enrolled as an organization."* **[verified]**
2. Apple does **not** require an entity merely because third-party businesses use your app. The only published legal-entity mandate is guideline **5.1.1(ix)**, scoped to banking, healthcare, gambling, cannabis, air travel and crypto — *"or that require sensitive user information."* Gym rosters, attendance and payment history are not on the list; whether they trip that fuzzy clause is a judgment call with **no published Apple precedent. [unverified risk, not a documented bar.]**

Revisit the org path only if you incorporate for CFDI reasons anyway.

---

## 3. Where the app lives, and how it deploys

### It goes in this monorepo

`apps/mobile`, alongside `apps/admin` and `apps/client`. Two things make this work that did not work a year ago:

- **Expo supports pnpm's isolated linker.** *"Starting with SDK 54, Expo supports isolated dependencies… pnpm using this as the default installation strategy unless it's disabled."* You do **not** have to switch to `node-linker=hoisted`, which means you keep the isolated-linker backstop on your dependency boundary. **[verified]**
- **Metro auto-configures for monorepos.** Since SDK 52, `watchFolders`, `resolver.nodeModulesPath` and `resolver.disableHierarchicalLookup` *"should be removed from manual metro.config.js configurations… now handled automatically by `expo/metro-config`."* SDK 57 added on-demand filesystem crawling (default on) which resolves symlinks outside the monorepo root. **The recommended config is near-empty** — ignore every blog telling you to hand-write resolver knobs. **[verified]**

⚠️ **Expo's own docs contain both eras.** Pre-SDK-54 pages still say to disable isolated installs "to avoid native build errors." Anything dated before mid-2026 encodes the old constraint. Treat the isolated linker as *probably fine but trial-required*, not proven for this dependency set.

**Integration chores nobody can skip:**

- `turbo.json`'s `build` task hardcodes `outputs: [".next/**"]`. A native app has no `.next`, and **EAS Build — not `turbo run build` — produces the binary.** `apps/mobile` needs its own task key or an exclusion.
- Tighten `engines.node`. The repo permits `>=22.13 <25`, but RN 0.86's own engines are `^20.19.4 || ^22.13.0 || ^24.3.0 || >= 25.0.0` — excluding 23.x and 24.0–24.2, which your range currently allows. Set `>=22.13 <23 || >=24.3 <25`. **[verified]**
- Add a dependency-cruiser rule: **`apps/mobile` ✗→ `@gym/data/server`.** The `server-only` package is a conditional-exports switch that throws on import when the `react-server` condition is absent — Metro never sets it, so the poison pill *works*, but it fails at **runtime**. The cruiser rule moves that failure to `pnpm lint` where it belongs.
- Run all EAS CLI commands from `apps/mobile`, with `eas.json` and `credentials.json` there.

⚠️ **Smoke-test before committing to this.** `eas-cli` has a bug history structurally identical to your setup: [#3247](https://github.com/expo/eas-cli/issues/3247) *"EAS Build fails to detect lock file and local monorepo packages in pnpm workspace"* (symptoms: "No lockfile found", and `workspace:*` packages being fetched from the npm registry and 404ing) and [#2978](https://github.com/expo/eas-cli/issues/2978) *"EAS mistakes pnpm for yarn workspace."* #3247 shows Closed as of Nov 2025 but **no resolution was visible — "closed" is not evidence of "fixed."**

### Hosting is structurally different from Vercel

This is the part that surprises people. There is no "push to main = deploy" for a mobile binary, and there never will be.

| | Web (Vercel) | Mobile |
|---|---|---|
| Trigger | `git push` to main | `eas build` — a deliberate CLI act, decoupled from git |
| Gate | none | Apple / Play review. *"90% of submissions are reviewed in less than 24 hours"* **[verified]**; Beta App Review has **no** published turnaround **[verified — any "24–48h" you have read is blog-sourced]** |
| Release | instant, atomic | manual, or phased rollout (7-day 1/2/5/10/20/50/100% ladder) |
| Rollback | instant revert | **none for a binary.** Pause the rollout, or ship a new build/OTA |

**What you *can* ship instantly is JavaScript.** EAS Update pushes *"non-native pieces (such as JS, styling, and images) over-the-air."*

The legal basis is narrower than folklore suggests. Cite **Apple guideline 2.5.2** (apps *"may not download, install, or execute code which introduces or changes features or functionality"*) and **Google's Device and Network Abuse policy**, whose text carries the actual carve-out: *"This restriction does not apply to code that runs in a virtual machine or an interpreter where either provides indirect access to Android APIs."* That interpreter clause is what EAS Update rides on. Apple's ADPLA §3.3.2 could not be re-verified (the PDF 404s) — **do not cite §3.3.2**, and note that "JS-over-the-air is compliant" is Expo/community practice, **not an Apple carve-out naming React Native. [inferred]**

- **OTA-able:** copy, JS logic fixes, new screens built from existing components, brand token values, new Supabase RPC calls from the existing client.
- **Needs a new binary + review:** any native module, an Expo SDK or RN bump, any new permission string, icon/splash changes.

**Use the `fingerprint` runtimeVersion policy.** It *"automatically increments whenever anything that may impact the native runtime changes, making incompatible updates extremely unlikely,"* whereas `appVersion` *"requires manual discipline."* Two channels: `production` and `preview`. **[verified]**

### The database does not change — but one discipline does

Same Supabase project, same RLS, same 52 RPCs. The publishable/anon key on the device is fine (*"Safe to expose online: web page, mobile or desktop app…"*); the secret key never ships (it *"bypass[es] Row Level Security entirely… with the `BYPASSRLS` attribute"*). **[verified]**

New backend surface a mobile client forces:
- A push-token table + RLS + register/unregister RPCs (small).
- FCM v1 service-account JSON and an APNs key, both via `eas credentials` (small–medium).
- An Edge Function calling the Expo Push API, mirroring the existing `send-email` pattern (small–medium).

**The real new discipline is RPC versioning.** Review latency plus a phased rollout plus users who never update means a shipped binary's call shapes stay live for **weeks to months** after `main` has moved on. `apps/admin` and `@gym/data` currently deploy atomically and have therefore never been versioned against each other. A shipped binary permanently ends that.

> **Rule: RPC changes stay additive and backward-compatible for at least one full release-and-rollout cycle.** Never rename or remove a parameter or return column a shipped binary calls. Add optional params with defaults, or a `_v2` name, and keep the old one alive.

**Also note:** Supabase renamed keys to `sb_publishable_` / `sb_secret_` in 2025, with legacy JWT keys *"deprecated by the end of 2026."* **Which format this project currently issues was not checked** — worth a look.

---

## 4. How much of the app actually transfers

Short version: **the rules and the data seam survive; the entire rendering layer does not.**

### Reuses as-is — about 7,000 lines, free **[verified]**

| Asset | Lines | Why it's free |
|---|---|---|
| `@gym/domain` | 2,142 | 6 modules, zero deps and peerDeps, zero react/next/DOM/node imports |
| `database.types.ts` | 1,875 | Full Row/Insert/Update plus Args/Returns for all 52 RPCs |
| `@gym/data` pure carve-outs | 1,029 | `derive.ts`, `plantilla-ctx.ts`, `export/rows.ts` — the `PURE_EXEMPT` set the poison-pill guard already whitelists |
| Admin view models | ~1,221 | session-vm 275, vender-vm 232, ticket-twin 188, marcadas 188, swipe 123, clientes-vm 109, recibo-envio 44, nav 38, paso-agenda 24 |
| `@gym/format` | 414 | Only `Intl` — **with one blocking risk, see §11** |
| `@gym/brand` tokens | ~350 | `BrandTokens = { light/dark: Record<TokenKey,string> }`, values are `"#5b6698"` / `"rgba(...)"` — both RN-native |

**The pleasant surprise is brand.** Because tokens are plain hex/rgba strings and not CSS-variable machinery, **runtime per-tenant theming in RN is a half-day, not a rewrite.** Only `tokensToCss()` is web-specific.

### Does not transfer — be blunt about this **[verified]**

- **7,940 lines of admin client TSX and ~3,600 lines of `@gym/ui`.** Rebuilt from zero. Plus 689 lines of `loading.tsx` that simply cease to exist.
- **954 `var(--token)` references** (696 admin, 258 ui) sitting inside inline style objects like `style={{ background: "var(--yellow)" }}`. RN has no CSS custom properties, no cascade, no class names. **NativeWind's `vars()` only reads values its compiler finds in class strings — it never touches an inline style object, which is where 100% of this app's color lives.** This single fact kills every "share the components" strategy.
- **11 `color-mix(in srgb, …)` calls.** No equivalent.
- The inline-style shorthand layer, none of which RN parses: 322 multi-value paddings (`"18px 20px"`), 209 border shorthands, 200 `background:` (7 of them gradients that break outright), 114 `cursor:`, 36 `transition:`, 20 `whiteSpace` + 10 `textOverflow` (→ `numberOfLines`), 9 `gridTemplateColumns`, 9 `animation:`, 8 scroll-snap, 3 `borderRadius:"50%"`.
- **685 `<div>`, 169 `<span>`, 107 `<button>`, 35 `<label>`, 6 `<input>`** — plus the tax people forget: **every bare string literal must be wrapped in `<Text>` or RN throws at render.**
- **`@gym/ui`'s framework neutrality is a lie.** Its peerDeps are `next`, `next-themes`, `react-dom` and `sonner`; `tab-bar.tsx` imports `next/link` + `next/navigation`, `theme-toggle.tsx` imports `next-themes`, both toasters import `sonner`. The first RN import hits these.
- **`sheet.tsx`**, your most-used interaction primitive: 27 DOM calls (`createPortal` to `document.body`, `document.querySelector('main.forge-scroll')` scroll lock, `visualViewport` listeners, `transitionend`, `focus({preventScroll})`, Escape). In RN this file mostly **deletes** — Modal + KeyboardAvoidingView + Reanimated cover it. The rewrite is *smaller* than the original.
- **RSC and server actions are not a shortcut.** Expo marks RSC and Server Functions experimental, *"production deployment is limited and not recommended yet,"* and incompatible with EAS Update. Port the 56 actions to direct calls — they average ~5 lines each.
- **Multi-tenancy has no port path; it is new product surface.** `(app)/layout.tsx:55-68` handles multi-gym staff by `redirect(https://${destino}${x-ruta})`. A binary has no hostname and cannot redirect to one.

### What gets *easier* — bank this against the estimate **[verified]**

1. **The entire soft-keyboard apparatus disappears.** `viewport.ts`'s `keyboardInset`, the `visualViewport` listeners, the maxHeight-above-keyboard math, `onFieldFocus` scrollIntoView — `KeyboardAvoidingView` replaces the lot.
2. **The app is already a native app wearing a browser.** `sm:max-w-[440px]`, one `<main>` scroller, a pinned TabBar, per-screen enter animations. There is no desktop layout to throw away.
3. **Tailwind usage is overwhelmingly layout** — the top utilities are `flex` (310), `items-center` (175), `flex-col` (93), all of which map onto Yoga defaults.
4. **`icon.tsx`'s 37 hand-drawn glyphs are all `<svg viewBox="0 0 20 20"><path>`** — a near-mechanical rename to `react-native-svg`.
5. `FlatList` beats the hand-scrolled web roster.

### Sizing **[inferred]**

**44–60 solo-dev days total.**

| Phase | Days | Driver |
|---|---|---|
| **Foundation** (before any screen) | **15–20** | Metro/EAS scaffold 2–3 · data layer + ADR 4–6 · auth + tenant resolution 2–3 · query cache replacing 35 `router.refresh()` sites 1–2 · **RN UI kit 6–9** · theme runtime 0.5 |
| inicio | 2–3 | Easiest. 493 lines, one `useState`, read-only, no forms |
| clientes | 3–4 | `swipe.ts` is already pure and tested; `useFlip` (`getBoundingClientRect`) has no RN analogue |
| asistencia | 5–7 | 956 lines, ~14 useState/useRef clusters, lazy month+day fetch with in-flight guards, optimistic `togglePase` + rollback. Concurrency at the door, not pixels |
| agenda | 6–8 | The `@gym/ui` agenda kit: editor-sheet 532, session-roster 344, wheel-picker 230 (snap physics needs re-tuning) |
| vender | 6–8 | 977-line money-path form, ~18 useState, plus the RECIBO whose perforation is `repeating-linear-gradient` |
| **cuenta** | **7–10** | **The long pole.** 445-line hub over ~2,450 lines of CRUD in 11 sheets, a 17-call `Promise.all`, **37 of the app's 56 server actions**, 5 drag-reorder lists, and an XLSX export that cannot run on device |

**Correction to an earlier assumption: agenda is *not* the hardest sector, and the code says why.** `week-group.tsx:7-12`: *"The SEMANA view is a day-grouped agenda, never a time grid (PRD (f))."* There is no día/semana time grid anywhere in this app — the classic RN calendar-grid pain point does not apply. The only month grids are `PaseCalendar` and `InicioCalendar`, both simple 7-column day pickers. **cuenta is the long pole.** **[verified]**

### Can we share components between web and native?

**No. Build a parallel `@gym/ui-native`.**

This is not the usual advice, and it is specific to *this* codebase: the 954 `var(--token)` references live in inline style objects. React Native Web, Tamagui, NativeWind and `.native.tsx` overrides all key off class strings or their own style primitives — **none of them reads an inline style object containing a CSS custom property.** Add `@gym/ui`'s hard peer dependencies on `next`, `next-themes`, `react-dom` and `sonner`, and the sharing path costs more than the rebuild.

**Share instead:** `@gym/domain`, `@gym/format`, the brand *tokens*, and the extracted view models. That is the ~7,000 free lines above, and it is the part that actually encodes how the gym works.

---

## 5. How the mobile app talks to the database

Two shapes were on the table:

- **Option A** — the device talks to Supabase directly with `@supabase/supabase-js` and the publishable key, relying on RLS, calling the same RPCs the web app calls.
- **Option B** — the device calls a new HTTP surface on `apps/admin` (route handlers), so `@gym/data`'s server DAL stays the single source of truth.

### First, correct the premise

**Tenant isolation does *not* live in TypeScript. It is in RLS, verified against the live database.** All 32 public tables have `relrowsecurity = true`. The only policy in the whole database with a `true` qual is `gym_anon_select` on the public tenant directory. Every other policy keys on the row's own `gym_id` via `is_staff_of(gym_id)` / `is_member_of(gym_id)` / `auth.uid()`. A hostile device holding the publishable key and a valid session **cannot** read a gym it has no membership row for. The 54 `.eq("gym_id", …)` calls are documented in-code as scope selectors — `gym.ts:88`: *"a scope selector, not a boundary — RLS stays the boundary (ADR-0001)."* **[verified]**

**So Option A would not have moved a security boundary onto the device, and the usual "you need a BFF for safety" argument does not apply here.** Say it plainly: **Option B is not a security win.** The device still holds the publishable key and a valid session and can always reach PostgREST directly. RLS is the boundary either way.

### Decision: Option B — `/api/movil/v1/*` route handlers on `apps/admin`

The argument is cost and hotfixability, not security.

| Axis | Option A (direct) | Option B (route handlers) |
|---|---|---|
| Port cost | A second DAL: **7,975 non-test LOC, 159 exports, 49 zod schemas, 38 wrapped RPCs**, PostgREST 1000-row pagination, N+1 rewrites, typed error translation — and abandoning 11,302 LOC of tests for the mobile surface | ~25–40 handlers × 15–30 LOC + a `createClientFromBearer` (~30 LOC) + a `gymId` param + a proxy exclusion ≈ **700–1,200 LOC of glue, zero duplicated logic** **[inferred]** |
| Metro feasibility | **Three independent hard stops:** 33 modules `import "server-only"` (the default condition throws unconditionally), 19 import React `cache` (Server-Components-only), 2 import `next/headers` **[verified]** | Untouched |
| ADR-0011 | **Erodes it.** Sharing any DAL module with Metro means stripping the `server-only` pill or adding the build step §1 explicitly forbids (*"load-bearing for security… a pre-built package could strip the directive"*) | **Preserves it exactly.** Route handlers are just more Next callers — precedent already exists at `cuenta/respaldo/route.ts` |
| Completeness | **Impossible anyway.** `invitaciones.ts` needs `RESEND_API_KEY`; `activacion.ts` / `registro.ts` need `TENANT_ASSERTION_KEY`. Option A reduces Option B's endpoint count; it never avoids Option B | — |
| Hotfixability | A wrong lifecycle verdict, backdate bound or tz derivation is **frozen in a shipped binary until App Review clears** | Every rule change ships from Vercel in minutes |

**The proposed hybrid (direct reads, RPC-only writes) is the worst of the three splits for this codebase.** Writes are already RPC-only and already self-scoping, so that half is free under either option. Reads are where the ~8k LOC of composition lives (`derive.ts`, `ocupacion`, `resumen`, respaldo pagination, aggregate-RPC fan-outs). That hybrid re-implements the expensive half and reuses the cheap half. **The split that *is* load-bearing is auth-direct / data-over-HTTP.** **[inferred]**

**Honest note:** the two research agents disagreed. The code-reuse auditor called a device-side Supabase client *"a legitimate architecture — no BFF needed"* and priced an isomorphic data layer at 4–6 days. They agreed on every fact (RLS is the boundary; the DAL cannot be imported by Metro as-is) and disagreed only on whether de-poisoning ~6,900 lines beats writing ~1,000 lines of glue. **Take Option B** — cheaper on the numbers, no ADR amendment whose stated rationale is security, and it keeps the rule engine on a surface you can hotfix.

### Option B's non-obvious obligations

- **Version the surface from commit one: `/api/movil/v1/`,** plus a minimum-app-version check.
- **Do not reuse the header name `x-gym`** — `tenantHeaders()` deliberately deletes inbound `x-gym` so that header is guaranteed proxy-derived.
- **Add a `gymId` param to `getOperatorGym`**, validated against `getOperatorGyms()`. `gym.ts:91-97` picks via `slugDelHost()`, which is null on native, and the `gyms[0]` fallback already exists — so this is a small edit, not a redesign.
- **Exclude API routes from `proxy.ts`'s `decideRedirect`** or they bounce to `/login`.
- `@gym/domain` and `@gym/format` are Metro-safe and should be consumed directly. **`@gym/data` cannot be** — it declares `peerDependencies: { next: "catalog:", react: "catalog:" }`, and 34 of its 37 exports sit behind the poison pill. Under Option B this is moot; under Option A it would have forced splitting the browser seam into a new package. Another point for B.
- Unguarded `p_gym_id` aggregate RPCs are safe against a hostile device — they are `security invoker`, so passing another gym's id returns an empty set. Stated as deliberate posture in the migration. **[verified]**

---

## 6. Two boundaries that ARE in TypeScript — fix these now

These are live issues on the web today. Mobile surfaces them harder, but neither is a mobile problem.

### 6.1 The socio leak

`gym.ts:55`'s `.in("role", ["owner","operator"])` is **the only thing** keeping a socio's `member` row from winning the admin app (audit #19). Omit that filter in any client and a socio enters the operator UI. RLS still denies clientes, ventas, asistencias and cobro — but `paquetes`, `perfil`, `coach`, `class_type` and `plantillas` are all `is_member_of`, so the socio would see the gym's catalog, coaches, class types and operator WhatsApp templates.

**A real product-boundary leak caused purely by a TS-side omission.** Under Option B it stays server-side where it cannot be omitted. **[verified]**

### 6.2 `staff_gym()` is `order by gym_id limit 1`

Ten write RPCs derive the gym internally and take **no gym parameter**:

`registrar_venta`, `create_class_session`, `edit_class_session`, `cancel_class_session`, `create_recurring_schedule`, `update_recurring_schedule`, `retire_recurring_schedule`, `ensure_week_materialized`, `crear_plantilla`, `sembrar_plantillas_default`.

**A multi-gym operator's in-app gym picker will be INERT for all ten** — they always hit the lowest `gym_id`. This is the known multi-gym RPC roulette. Neither data-access option fixes it; both inherit it; mobile surfaces it harder because there is no hostname to disambiguate.

**Fix required before any gym switcher ships, on web or native:** add `p_gym_id` with an `is_staff_of` guard. This is a migration you can write today, independent of the port. **[verified]**

### 6.3 Gap worth closing

The **24 `SECURITY DEFINER` functions were not individually swept for parameter injection.** Three spot-checks (`toggle_favorito_tipo`, `mi_membresia`, `roster_clase`) self-scope correctly. A full sweep is worth doing before *any* option ships — a definer hole is equally exploitable from the web today.

---

## 7. Multi-tenancy without a hostname

The web resolves the tenant from the **hostname**: a `gym_domain` row maps host → gym, `proxy.ts` stamps `x-gym` and `x-brand`, and the root layout SSR-inlines that brand's tokens so there is no FOUC. **A native app has no hostname, and one binary serves every gym.**

### Decision: one neutral `iBookit` binary; tenant resolves from membership rows after login

Auth replaces the host header. A gym-switcher handles multi-gym staff. Deep links and gym-code entry screens are pre-auth *hints* only, never the source of truth.

**The store rules make the alternative dangerous, and they are unambiguous:**

- **Guideline 4.2.6:** *"Apps created from a commercialized template or app generation service will be rejected unless they are submitted directly by the provider of the app's content… Another acceptable option for template providers is to create **a single binary to host all client content in an aggregated or 'picker' model**."* **Apple names your design as acceptable.** **[verified]**
- **Guideline 4.3(a):** *"Don't create multiple Bundle IDs of the same app (for example, submitting a separate map app for every city in the world instead of a single worldwide map that allows users to search any city)."* A per-gym-build strategy walks straight into this example. **[verified]**
- **Google Play** recommends per-client listings with unique store assets for white-label strategies, but no Play text was found barring a single multi-tenant app. **[inferred]**

**Caveat on confidence:** no real-world 2024–2026 4.2.6 rejection reports for multi-tenant SaaS surfaced. The verdict rests on guideline text, not precedent.

### The product cost you have to accept

**Brand token values are JS and ship OTA fine. Icon, splash screen and app name are baked at build time** — configured via `icon`, `ios.icon`, `android.adaptiveIcon` and the `expo-splash-screen` plugin, applied to the native project at build/prebuild. **[verified]**

iOS alternate app icons (`UIApplication.setAlternateIconName`) let you switch between a **pre-bundled fixed set**, with iOS showing a system alert on change — a partial trick for a small closed roster, useless for an open-ended gym list. **[inferred]**

> **The honest consequence: every gym's staff installs an app called *iBookit*, with the iBookit icon and the iBookit splash, and only sees their own brand after logging in.**

That is a positioning decision, not a technical detail — and worth telling clients before they discover it in the store. There is no compliant alternative: the shape that would give each gym its own icon is exactly the shape 4.3(a) rejects.

---

## 8. Auth on native

Web uses `@supabase/ssr` cookie sessions. **Those do not exist on native.** `@gym/data/client` is `createBrowserClient` with `cookieOptions`, and its storage is built behind an `isBrowser()` guard that reads and writes `document.cookie` — **Hermes cannot run it.** Build a separate factory on `@supabase/supabase-js` (already in the catalog at `^2.106.2`). **[verified]**

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

**Why the AppState listener is mandatory:** auth-js's `isBrowser()` is `typeof window !== 'undefined' && typeof document !== 'undefined'`, which is false on RN, so `_handleVisibilityChange()` takes the branch that just calls `startAutoRefresh()` and returns. **The 30-second refresh ticker then runs continuously — including while backgrounded — unless you stop it.** **[verified]**

### Sharp edges, all [verified]

| Edge | Detail | Fix |
|---|---|---|
| **`signOut()` kills the front desk** | The signature is `signOut(options = { scope: 'global' })` — the default terminates **all** of the user's sessions. An operator tapping *Cerrar sesión* on the phone logs out the admin web app at the desk | `signOut({ scope: 'local' })` |
| Duplicate clients are silent on RN | The "Multiple GoTrueClient instances detected" warning is gated on `isBrowser()`. Two clients sharing a storage key fight over the refresh token **with no console output** | One module-level singleton |
| PKCE silently downgrades | `generatePKCEChallenge` checks `crypto.subtle` + `TextEncoder`; on failure it logs *"WebCrypto API is not supported… default to use plain"* and sets `codeChallengeMethod = 'plain'`. Hermes ships no `crypto.subtle` | Moot in v1 — the default flow is `implicit` and password sign-in doesn't use PKCE |
| **`getClaims()` does not port** | It falls back to a network `getUser()` call whenever `crypto.subtle` is absent — i.e. always, on Hermes. **The entire `@gym/data/server` tier gates on `getClaims`** (`proxy.ts:78`, `_auth.ts:19`). That pattern does not transfer: every gate becomes a round-trip and fails offline | Gate on `onAuthStateChange` events |
| Silent logout on cold start | `_recoverAndRefresh` wraps everything in `try {…} catch (err) { console.error(err); return }`. A throwing storage adapter boots with no session and only a `console.error`. Triggers: Android Auto Backup restoring AsyncStorage ciphertext without the Keystore-bound key; iOS Keychain surviving a reinstall that wiped AsyncStorage | Plain AsyncStorage avoids the whole class |
| Refresh rotation race | A refresh token is single-use (10s reuse interval + parent exception); outside those, *"the whole session is regarded as terminated"* | `lock: processLock` — this is why the official example passes it |

**Offline expiry is already correct — do not fight it.** A failed fetch throws `AuthRetryableFetchError`, as do 502/503/504, and `_recoverAndRefresh` / `_callRefreshToken` only `_removeSession()` when `!isAuthRetryableFetchError(error)`. Network-down keeps the session; a genuine 400/401 wipes it and emits `SIGNED_OUT`. Let `getSession()` — a pure local read — drive the UI. **[verified]**

### Storage: AsyncStorage, not SecureStore

Supabase's own RN quickstart uses plain AsyncStorage; SecureStore is an opt-in hardening step. Supabase's Expo tutorial states a 2048-byte SecureStore limit and works around it with an AES `LargeSecureStore` class; **Expo's current doc has softened this** to *"Large payloads can be rejected by the underlying platform… Expo does not enforce a limit"* — a platform-dependent rejection, not a hard cap. A real session (access token JWT + refresh token + full `user` with `app_metadata`, `user_metadata`, `identities[]`) realistically exceeds 2048 **[inferred]**. If you want SecureStore without AES, the supported path is the `userStorage` option, which splits the bulky user object into `storageKey + '-user'`.

**Measure `JSON.stringify(session).length` on a real operator login before choosing.**

### Deep links: not needed in v1

The admin app's only sign-in is `login-form.tsx:58` `signInWithPassword`. There is **no** `resetPasswordForEmail`, no magic link and no recovery route anywhere under `apps/admin`. `/activar`, `/auth/confirm` and the branded `send-email` hook all serve the **client** app. The deep-link problem evaporates for this port. **[verified]**

**If you ever do want auth mail to open the app — do not switch `redirect_to` to a custom scheme.** `send-email/index.ts:41-66` derives branding by doing `new URL(redirectTo).hostname → gym_id_por_host(hostname,'client') → gym.brand_name`. An `ibookit://auth/confirm` URL *parses* (hostname becomes `auth`), resolves no gym, and **the mail silently degrades to the neutral "Notificaciones" sender.** Keep `redirect_to` on `https://{gym-host}/auth/confirm?…` and host AASA / assetlinks per gym host.

Helpfully, the mail already uses the `token_hash` + `type` recipe (`correo.ts:37-45`), which is exactly what native `verifyOtp({token_hash, type})` consumes — and `verifyOtp` has no same-device constraint, unlike `?code=` (PKCE codes are 5-minute, single-use and same-device-only). **[verified]**

Universal Links do not scale across per-gym custom domains without an `apple-app-site-association` and `assetlinks.json` on **each** domain. **[verified]**

### Navigation gating

Subscribe to `onAuthStateChange`, not a bare `getSession()` race — auth-js guarantees an `INITIAL_SESSION` event to every new subscriber after `initializePromise` resolves, so that is your "auth has booted" signal. Hold the splash until it arrives. Expo Router SDK 53+ uses declarative `<Stack.Protected guard={!!session}>`, not imperative redirects. **[verified]**

---

## 9. Platform facts, and the alternatives we rejected

### Current Expo facts **[verified]**

**SDK 57, published 2026-06-30.** React Native 0.86, React 19.2.3, react-native-web 0.21.0, **minimum Node 22.13.x**. The changelog calls it *"a small, focused release… React Native 0.86 is intended to have no breaking changes from 0.85."*

- **New Architecture (Fabric) is mandatory and non-disableable since SDK 55** (RN 0.82+). SDK 54 was the last with `newArchEnabled: false`; Legacy was frozen in June 2025.
- **Expo Router is no longer built on React Navigation.** SDK 56 forked it: *"Now that `expo-router` no longer depends on `react-navigation`, most code imported directly from `@react-navigation/*` packages will no longer work out of the box alongside `expo-router`."* `expo-router@57` has zero `@react-navigation/*` entries; it depends on `standard-navigation@^0.0.5` + `react-native-screens@^4.26.0`. **Choosing React Navigation now means leaving Expo's tested path entirely — so: Expo Router.**
  - Real costs, stated: typed routes are **still beta and opt-in** (`experiments.typedRoutes`, no relative paths, no query-param typing — re-check at scaffold time); the dep tree is heavy for six screens (`@expo/ui`, two `@radix-ui` packages, `vaul`, plus `@testing-library/jest-dom` as a *runtime* dep); and **`standard-navigation` is at version 0.0.5** and is expo-router 57's entire navigation core — **[unverified]** what it is or how stable.

### React version — resolved, and it is not a blocker

`react-native@0.86.0` peers on `^19.2.3`; `expo` and `expo-router` both declare `"react": "*"`; `next@16.2.6` accepts `^19.0.0`. **The catalog's `19.2.4` satisfies all three.** **[verified]**

`tools/guards/manifests.test.ts:69-80` asserts every manifest in `apps/*` and `packages/*` pins react as the literal string `"catalog:"`, and it runs in `pnpm test` → pre-commit. **This is only a blocker if you decide to diverge, which you shouldn't.** `apps/mobile` writes `"react": "catalog:"` like everything else and the guard passes untouched.

The only friction is `npx expo install --check`, whose logic is `semver.satisfies(actual, expected)` against Expo's exact expected string `19.2.3`, so `19.2.4` fails and exits non-zero. Documented escape hatch: `"expo": { "install": { "exclude": ["react"] } }`.

### Windows

- **MAX_PATH bites *local Android builds*, not Metro.** Confirmed live case: `react-native-screens` (an expo-router hard dep) fails the Android CMake/Ninja compile with *"Filename longer than 260 characters"* on the nested Prefab/.cxx path, typically on the **second** build. Mitigate with `LongPathsEnabled`, a short checkout path, or — simplest — **build on EAS instead of `npx expo run:android`.** Whether it is fixed in `^4.26.0` is **[unverified]**.
- Expo's Windows troubleshooting page is cmd.exe syntax; in PowerShell use `$env:LOCALAPPDATA`, and the `watchman watch-del-all` step is a no-op on Windows.

### Data fetching

**TanStack Query.** Expo recommends it (2026 stack blog; devtools plugin ships in expo/dev-plugins) and Supabase's Expo guide prescribes no state library. Convention: Supabase supplies client + session, TanStack supplies cache. **This is the replacement for the app's 35 `router.refresh()` sites.** Expo Router's `createStaticLoader`/`useLoaderData` are web/SSR-oriented and **not** the native data path. **[verified]**

### Alternatives, evaluated not strawmanned

- **(a) PWA only — fails the goal outright on iOS.** No route lists a bare PWA on the App Store; it must be wrapped, and PWABuilder's own generated iOS project is *"routinely rejected"* under guideline 4.2 without native functionality — and compiling it needs a Mac. Android is fine via TWA/Bubblewrap. iOS web push works only for home-screen-installed PWAs. **[inferred]**
- **(b) Capacitor / webview wrapper — fastest to two listings, real iOS risk.** Guideline 4.2 verbatim: *"Your app should include features, content, and UI that elevate it beyond a repackaged website. If your app is not particularly useful, unique, or app-like, it doesn't belong on the App Store."* **Honest caveat: the "4.2 is the #1 wrapper rejection reason" claim is [unverified]** — it traces to vendor blogs and forum anecdotes, with no Apple ruling or published statistic found.
- **(c) Expo shell + a few genuinely native screens + webview for the rest** — the research's own fallback recommendation. Satisfies 4.2 by construction, reuses the existing admin UI, and grows into (d). **This is the option to fall back to if the 44–60-day estimate proves unaffordable** — it shares the same Expo shell, EAS pipeline, monorepo config, tenancy model and backend surface as (d), and differs only in how many screens are native on day one.
- **(d) Full RN rebuild** — lowest long-term risk and maintenance cost, slowest to first listing. **Recommended**, with (c) as the pressure valve.

---

## 10. The decisions

| Decision | Call | Basis |
|---|---|---|
| Store shape | **One neutral iBookit binary**, runtime-themed | 4.2.6 single-binary safe harbor; 4.3(a) rejects per-client clones |
| Tenant resolution | **Auth first, then membership rows**; gym-switcher for multi-gym staff; deep links as hints only | Mirrors web `resolveTenant`; no hostname exists |
| Repo | **`apps/mobile` inside this workspace**, isolated linker retained | SDK 54 isolated-first-class; SDK 52+ auto-config |
| Boundary guard | dependency-cruiser rule `apps/mobile` ✗→ `@gym/data/server` | `server-only` throws at import — move that failure to lint time |
| Data access | **Route handlers at `/api/movil/v1/*`**; supabase-js on device for auth only | ~1,000 LOC of glue vs a 7,975-LOC second DAL; preserves ADR-0011; hotfixable |
| UI kit | **Parallel `@gym/ui-native`**; share domain + format + tokens + view models | 954 `var(--token)` refs in inline style objects; `@gym/ui` peers on next/next-themes/react-dom/sonner |
| Router | **Expo Router** | SDK 56 forked React Navigation out; they no longer interoperate |
| React version | **Do not diverge — `"react": "catalog:"`** | 19.2.4 satisfies RN 0.86, Expo and Next; manifests guard passes untouched |
| Data fetching | **TanStack Query** | Expo's recommendation; replaces 35 `router.refresh()` sites |
| Auth | supabase-js singleton + AsyncStorage + `processLock` + AppState listener; **no deep links in v1** | Admin's only sign-in is `signInWithPassword` |
| `runtimeVersion` | **`fingerprint`**, two channels (`production`, `preview`) | Expo's own "manual discipline" warning on `appVersion` |
| Keys | publishable on device; `service_role` **never** | Supabase api-keys doc |
| RPC changes | **Additive-only for one full rollout cycle** | Shipped binaries age behind `main` |
| Apple enrollment | **Individual, web, $99, today** | Not hardware-blocked; org needs D-U-N-S + entity + website |
| Mac | **Do not buy or rent.** The iPhone closes the loop | EAS covers the entire ship path |
| Offline support | **Out of v1** | Nothing in the estimate covers it; a desk app that works through an outage is a different product with a local write queue. Revisit only if `forge` reports real outages |

---

## 11. The plan

### Day 1 — three smoke tests, before any UI exists

All three can re-price or invalidate the port, and all three are cheap. **Do them in this order.**

1. **Hermes `Intl.DateTimeFormat` with `{ timeZone: "America/Mexico_City" }` + `formatToParts`, on a real low-end Android device.**
   `packages/format/src/fecha.ts:19-23,66-70,99-124` does two-pass DST math, and **every Agenda write instant and every reader window bound flows through it.** Hermes' `IntlAPIs.md` documents gaps in `dayPeriod`, `fractionalSecondDigits`, `formatMatcher` and `numberingSystem` — and is **silent on `timeZone`**. This is **[unverified]**, not confirmed working. Failure means `@formatjs/intl-datetimeformat` plus tz data polyfills: a bundle-size and correctness hit across all six sectors. **This is the single highest-consequence unknown in the project.**
2. **Metro resolving `@gym/domain/rules`** — raw `.ts` behind a subpath `exports` map, under pnpm's isolated linker, with no build step permitted by ADR-0011. Throwaway Expo app, import it, run one rule on-device. `unstable_enablePackageExports` may be needed. **If this fails, the entire "share the pure packages" premise fails.**
3. **`console.log(typeof globalThis.crypto?.subtle)` in a dev build** — confirms the PKCE-plain and `getClaims`-network findings, which are inferred from source absence rather than from a doc.

Also on day 1, in parallel and blocking nothing else: **start the Apple Developer Program enrollment.** ~15 minutes, individual, web, your own credit card (paying with someone else's delays enrollment pending photo ID). Approval has no published SLA, and the $99 is a hard prerequisite before the incoming iPhone can run anything at all.

### Then

4. **`eas build --platform android`** on a hello-world `apps/mobile` importing one `@gym/domain` symbol. This tests what doc-reading cannot settle: the `eas-cli` pnpm-workspace bugs (#3247/#2978) and Metro's handling of `@gym/ui`'s deep subpath exports. Build on EAS rather than `expo run:android` — MAX_PATH argues for it regardless.
5. **Two measurements:**
   - **Route-handler latency**, device → Vercel → Supabase, with one throwaway endpoint. This is the only number that could overturn the Option B verdict, and it matters most at the door during pasa lista, against a DAL baseline of 19/19 under 50ms. **[unverified]**
   - **`JSON.stringify(session).length`** on a real operator login, to settle AsyncStorage vs `userStorage`.
6. **Ship the `staff_gym()` `p_gym_id` + `is_staff_of` migration** (§6.2). Prerequisite for the multi-gym story, fixable today, independent of the port.
7. **Foundation, 15–20 days.** Scaffold → data layer + an ADR for the `/api/movil/v1` seam → auth + tenant resolution → TanStack cache → `@gym/ui-native` → theme runtime.
8. **Sectors, easiest-first for velocity feedback:** inicio → clientes → asistencia → agenda → vender → **cuenta last**. `cuenta` has a hard carve-out: `/cuenta/respaldo`'s exceljs XLSX cannot run on device and stays a server endpoint the app opens or shares.

### What each piece of hardware unblocks

- **iPhone arrives:** the loop closes. Dev build + `expo-dev-client` + EAS Update gives iOS UI iteration on a real device at no recurring cost. This is also what makes on-device screenshots convenient (though not required — see §2).
- **Mac arrives:** adds local Xcode compiles, the Simulator, and cabled debugging. **Nothing in the ship path depends on it.** A Mac is genuinely never needed for enrollment, signing, building, submitting, TestFlight, App Store Connect, OTA updates, or push credentials.

### Two decisions to make in week 1

- **`/api/movil/v1/` versioning + a minimum-app-version check, from the first commit.** `apps/admin` and `@gym/data` have never been versioned against each other because they deploy atomically. A shipped binary permanently ends that, and retrofitting versioning after the fact is much worse than starting with it.
- **Offline scope, explicitly — recommended OUT for v1.** Nothing in any estimate covers it. The web app assumes connectivity on every read. Decide now, not at week 6.

---

## 12. What would change this answer

Ranked by how much damage each would do.

1. **Hermes cannot do `Intl.DateTimeFormat` with a `timeZone`.** Re-prices every sector. **Smoke test #1 settles it in an hour.**
2. **The EAS + pnpm-workspace spike fails.** Fallbacks in order: `node-linker=hoisted` (costs the dependency-boundary backstop), then a separate repo. A green spike makes the in-repo verdict solid; a red one reopens the whole packaging question.
3. **Route-handler latency is bad at the door.** Would push toward direct-Supabase for the hot read paths, i.e. a partial Option A after all.
4. **EAS Build's hosted macOS workers turn out not to satisfy Apple's upload requirement.** Apple documents only Xcode / Swift Playground / altool / Transporter, all macOS-only, with no web upload — while Expo's own doc says *"EAS Submit works on macOS, Linux, and Windows."* These reconcile cleanly (EAS runs Apple's macOS-only tooling *on its own macOS workers* for you), and one research agent verified the Expo side, but the two were flagged as contradictory. **Treated here as low risk; the step-4 spike proves it either way.**
5. **Real 4.2.6 rejection precedent for multi-tenant SaaS surfaces.** The one-binary verdict rests on guideline text with zero corroborating rejection reports.
6. **The white-label icon/splash constraint proves commercially unacceptable.** If gym clients demand their own icon and name on the home screen, one binary is off the table regardless of what Apple permits — and the compliant alternative does not exist.
7. **The 44–60-day estimate proves unaffordable.** Fall back to option (c): Expo shell + native check-in/push + webview for the long tail, growing into the full rebuild.

## 13. Known gaps, not closed

- Whether remote device farms can install an ad-hoc / dev-client `.ipa` (the "does a farm substitute for an iPhone" question).
- The 24 `SECURITY DEFINER` functions were not individually swept for parameter injection.
- Which Supabase key format this project currently issues (legacy JWT vs `sb_publishable_`); legacy is *"deprecated by the end of 2026."*
- The free-app path's App Store Connect agreements and Mexico tax forms — the next thing that can silently block a first submission.
- Whether a Mexican INE is accepted on Apple's web/support identity path.
- What `standard-navigation@0.0.5` (expo-router 57's entire navigation core) actually is, and how stable.
- Apple Beta App Review turnaround: no published figure exists.
