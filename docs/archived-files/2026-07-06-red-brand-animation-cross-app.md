# RED Brand — Animated Logo & Cross-App Animation Structure

**Date:** 2026-07-06 · **Companion to:** `2026-07-06-red-client-design-remediation.md` (this is Slices 5–6 in depth).
**Purpose:** how the RED animated logo + brand should be structured so **one** RED implementation renders correctly across **all three** animation surfaces (admin login, client login, client landing); a rebuild-grade spec of the mock's neon-ring ignition; and the concrete way to **test the RED animation in the admin today**.
**Mock (source of truth):** `C:\Users\Aaron\Desktop\Pending\Red-1.0 Client App Frontend Design\RED-1.0-Design\index.html`.
**Audit (2026-07-06):** verified alongside Doc 1 by the same adversarial pass — the SVG/keyframe spec matched the mock byte-for-byte. This revision folds in the fixes: the `logo{animate}` factoring (not a new `heroMark` slot), the `idSuffix`-not-`useId` guidance, and the static-symbol / `_uid` / neon-copy / `stroke-linejoin` spec nits.

---

## 0. The one-line finding
The brand-animation plumbing already works cross-app (the admin renders the Forge login hero perfectly through it). RED just ships the **wrong artifact** (a double-chevron ignition instead of the mock's neon ring), and the client **landing has no animation slot at all**. Fix = build the ring once, **widen the existing `logo` slot to opt into animation**, and wire it into three consumers.

---

## 1. Current architecture — how brand animations flow

### The `BrandModule` contract (`packages/brand/src/registry.ts:39-68`)
| member | type | role |
|---|---|---|
| `id` | `BrandId` | registry key |
| `tokens` / `css` | `BrandTokens` / `string` | light+dark CSS-var contract, precomputed for SSR `<style>` |
| `copy` | `{name, description}` | title + login wordmark |
| `logo` | `ComponentType<{size?}>` | **static** lockup (headers/footers/toolbar), recolors via CSS vars |
| `appIcon` | `string` | favicon SVG markup |
| `loginAnimation?` | `ComponentType<{name, children}>` | **optional** full-viewport login hero; MUST render `children` (the form) |

`loginAnimation?` is the **only** animation slot, and it is a *form-bearing hero*, not a standalone mark.

### Admin consumption — the working Forge reference
`apps/admin/src/app/(auth)/login/page.tsx:14-27`:
```tsx
const brand = await resolveBrand();
const LoginHero = brand.loginAnimation;
return LoginHero
  ? <LoginHero name={brand.copy.name}><LoginForm afterHero /></LoginHero>
  : <StaticLogin logo={brand.logo}><LoginForm /></StaticLogin>;
```
Brand is resolved host→brand in `apps/admin/src/proxy.ts:29-36` → `resolveTenant` → `x-brand`. Forge admin hosts (`forge.localhost`, `red-2-0-admin.vercel.app`) map to gym `forge` → `ForgeLoginAnimation`. The form waits for the hero via `afterHero` → `HERO_OFFSET = 1590ms` (`login-form.tsx:26,39`).

### Client consumption — same seam, plus a gap
- `/entrar` (`entrar/page.tsx:11-24`) and `/registro` (`registro/page.tsx:19-42`) use the **identical** `loginAnimation` seam; RED → `RedLoginHero` (the chevron ignition).
- **Landing** (`apps/client/src/app/page.tsx:38,52`) renders **only the static `logo`** (`<Logo size={64}/>`) — it never touches `loginAnimation` and **has no animated-hero slot**. The mock's landing hero *is* the neon-ring ignition (`redlogo-anim data-size="200"`, mock line 1070), so today there is **nowhere to render it**. This is the structural gap.

### How the resolved module is obtained
Both apps share `resolveBrand()` (`apps/{admin,client}/src/lib/brand.ts:14-19`): read `x-brand`, validate against `brands`, fall back to `DEFAULT_BRAND`. A page reads `brand.loginAnimation` / `brand.logo` off it.

---

## 2. The gap, precisely
1. **Mark identity:** RED's `RedMark`/`RedLockup` (`packages/brand/src/red/logo.tsx:12-68`) is a **double forward-chevron**; the mock is a broken **neon ring** enclosing a stroked "RED" wordmark.
2. **Animation:** RED's `RedLoginAnimation` (`red/login-animation.tsx:19-76`) scales the chevron out of an ember (`red-ignite`/`red-ember`/`red-rise`) — a *different mechanism* from the mock's `ringDraw → redFlick → redBreathe`.
3. **No landing slot:** the client landing can't host any animated mark.

---

## 3. Target structure — one ring, three surfaces

**Home:** `packages/brand/src/red/` (same place as today's chevron), following the module's existing formless-primitive + adapter split.

1. **New formless primitive** — `red/ring-mark.tsx` exporting `RedRingMark({ size, animate? })`: the ring SVG + wordmark + local `red-*` keyframes + reduced-motion handling. No viewport shell, no form slot. (Mirrors how `RedLoginAnimation` is formless and `RedLoginHero` adds the form.)
2. **Hero adapter unchanged** — `RedLoginHero` (`red/login-hero.tsx:24-42`) composes `RedRingMark` inside its `bg-backdrop` stage and overlays `children` (the form), so the `loginAnimation` contract is satisfied as-is.
3. **Widen the existing `logo` slot — do NOT add a new contract member.** A `heroMark?` slot's signature would be *identical* to `logo` (`{size?}`), differing only by animating — and `RedRingMark` already carries that as an `animate?` flag. A whole new contract slot for a single consumer (the landing) is exactly the single-caller abstraction ADR-0012 rejects. Leaner:
   ```ts
   readonly logo: ComponentType<{ size?: number; animate?: boolean }>;  // widened: static by default, animates on opt-in
   ```
   - RED points `logo` at `RedRingMark` (which reads `animate`); Forge's static logo simply ignores the flag.
   - **Client landing** (`page.tsx`): `<Logo size={200} animate />` → the ring ignites on RED, static everywhere else, **zero brand-specific code in the page** and **zero new contract surface**.
   - **Headers / footers / toolbars** keep calling `<Logo />` with no `animate` → unchanged static lockup.
   - **Both login heroes** already compose the mark inside their form-bearing shell; they pass `animate` to it.

```
                         RedRingMark  (packages/brand/src/red/ring-mark.tsx)
                        /      |       \
   admin /login        client /entrar   client  /   (landing)
   (loginAnimation)    /registro         (logo animate)
                       (loginAnimation)
```
This is additive and presentation-only — it does not cross the pure/data boundary (brand still imports only React).

---

## 4. The RED neon-ring — rebuild-grade spec

The mock has **two** marks: a **static** broken-ring symbol for small lockups (`#redmark-ring`, mock lines 998-1005 — use for `logo`/`appIcon`) and the **animated** hero logo (`redLogoSVG`, lines 1811-1831 — the `logo animate`/login artifact). Extract the animated one.

### SVG structure (`redLogoSVG`, mock 1818-1830)
- `<svg viewBox="0 0 1254 1254" width=height=size>`, class `red-svg breathe`. The outer `<g>` inherits `fill=none stroke-linejoin=round` (mock:1823) and the wordmark group adds `stroke-linecap=butt` (mock:1826) — **carry `stroke-linejoin:round`**, it's load-bearing for the R-bowl/leg corners.
- **Two gradients** (ids MUST be unique per instance; the mock appends a per-instance number `_N` via a counter on `redLogoSVG._uid`, line 1817 — in the rebuild use a deterministic `idSuffix` prop, see build-gotchas):
  - `ringGrad` — vertical (627,30)→(627,1224): `#d92b1f`@0 · `#c8161c`@.5 · `#8f1014`@1.
  - `redBody` — vertical (0,478)→(0,773): `#e23222`@0 · `#c8161c`@.35 · `#7e0d10`@1.
- **Broken ring** = two arcs, r=597, stroke `url(#ringGrad)`, `stroke-width:14`, `stroke-linecap:butt`:
  - `ringtop`: `M77.5 378.7 A597 597 0 0 1 1176.5 378.7`
  - `ringbot`: `M1176.5 845.3 A597 597 0 0 1 77.5 845.3`
  - (gaps at the sides — a **broken** ring, the signature)
- **Wordmark** in `<g transform="translate(0 27)">`, three letter groups, each colored strokes `url(#redBody)` width 37 + inner highlight `stroke #ffd8b8` width 5 opacity .5 `translate(-2 -8)` (the neon-tube inner light):
  - **R**: stem `M72 478 V746`; bowl `M72 478 H266 C311 478 343 502 343 544 C343 580 328 608 296 625 C257 640 230 633 204 624`; leg `M210 626 L324 742`
  - **E**: `M510 478 H767` / `M510 612 H767` / `M510 746 H767`
  - **D**: stem `M919 478 V746`; bowl `M919 485 H1049 C1132 485 1199 541 1199 613 C1199 685 1132 741 1049 741 H919`
- Static symbol variant (`#redmark-ring`): same arcs stroked twice — base `#cf1f1c` w74 + coral highlight `#ff7a63` w22. The neon drop-shadow filter is **not** in the symbol — it's applied by the consumer class `.redmark`/`.redmark.sm` (mock:126-127); this small lockup renders with the lighter `.sm` two-layer filter.

### Keyframes (mock 131-148) — the ignition
| keyframe | effect | timing |
|---|---|---|
| `ringDraw` | `stroke-dashoffset 1410→0` draws each arc (start hidden `dasharray/offset:1410`) | ringtop `.9s cubic-bezier(.45,.05,.35,1) .15s forwards`; ringbot delay `.6s` |
| `redFlick` | neon opacity strobe `0→.75→.08→…→1` per letter | R@1.18s, E@1.46s, D@1.72s, each `.6s forwards` |
| `redBreathe` | idle glow — 3-layer `drop-shadow` crimson↔brighter pulse | `4.2s ease-in-out 2.4s infinite` (after ignition) |

Base glow filter on `.red-svg`: `drop-shadow(0 0 3px #d92b1f) drop-shadow(0 0 8px #b5161c) drop-shadow(0 0 16px #7e0d10)`. For the **landing** hero also port the neon-copy keyframes (`copyNeonOn`/`copyDashDraw`/`copyTextBreathe`/`copyDashBreathe`, mock 357-360). Note the grouping: the flanking rules (`.cm-sub .ln`, `copyDashDraw`/`copyDashBreathe`) flank the **"Entrenamiento funcional"** sub-line, while **"Con beneficios de luz roja"** (`.cm-vals`) is a **rule-less** neon tagline (`copyNeonOn`+`copyTextBreathe`).

### Colors → route through the token contract
The mock hardcodes hexes; the rebuild must map them to the `@gym/ui` CSS-var contract (RED's `--yellow`=crimson `#dc2626`, `--gold`, `--yellow-soft`, etc. per `red/tokens.ts`) so the mark stays brand-swappable and repaints correctly under the SSR-injected token block.

### Build gotchas (all confirmed)
- **Unique gradient ids per instance** — the landing renders the static ring logo AND the animated ring in one DOM, so shared ids collapse `url(#id)` to the first match (the mock's `redLogoSVG._uid` counter, lines 1811-1817, exists for exactly this; today's `RedMark` hardcodes id `red-accent`, `logo.tsx:33`). **Prefer a deterministic `idSuffix` prop** (e.g. `"hero"`/`"lockup"`) over `useId()` — it keeps `RedRingMark` a zero-JS Server Component. (`useId()` *is* RSC-safe in React 19/Next 16 — unlike `useState`/`useEffect` it does not force `"use client"` — so it also works; only reach for it if you already need `"use client"` for another reason.)
- **Inline styles, not Tailwind classes** — the **admin** app does not `@source`-scan `@gym/brand`, so utility classes tree-shake away there (documented at `red/login-hero.tsx:14-16`). Use `style={{…}}` with `var(--…)`.
- **Zero client JS** — the animations are pure CSS keyframes needing no runtime JS, so keep `RedRingMark` a Server Component with no `"use client"`. (Correction to an earlier draft: `"use client"` would *not* remove it from SSR — client components still render to the first byte and then hydrate; the reason to avoid it here is the needless hydration cost, not "first byte".)
- **Reduced-motion** — rely on the global collapse in `packages/ui/src/motion.css:64-72`; make every ring/letter animation use `forwards`/`both` fill so the reduced path lands on the **fully-drawn, lit** ring. Do not add per-component media queries.

---

## 5. Deliverables (Slice 5–6 build list)
1. `red/ring-mark.tsx` — `RedRingMark({size, animate, idSuffix})`: static (fully-lit) + animated (ignition) paths, **deterministic `idSuffix` gradients** (zero client JS — no `useId`/`"use client"`), inline-styled `var(--…)` colors, reduced-motion via `forwards` fill.
2. Replace the chevron in `red/logo.tsx` (`RedMark`/`RedLockup`) + `appIcon` with the **static** ring geometry (small lockups + favicon).
3. Point `RedLoginHero` at `RedRingMark` instead of the chevron ignition; retune the admin `HERO_OFFSET` (1590ms) to the ring's ignition length (~ letters settle ≈ 2.3s).
4. **Widen `logo`** to `{size?; animate?}` on the `BrandModule` type; point RED's `logo` at `RedRingMark`; the client landing calls `<Logo size={200} animate/>` — no new contract member (avoids a single-caller slot per ADR-0012).
5. Port the landing neon-copy keyframes for the tagline (Doc 1 Slice 6).

---

## 6. Admin test procedure — works TODAY (no DB change)

**The reveal:** `resolveTenant` maps host→gym→brand and **does not filter by the `app` column**, and a RED admin host already exists:

| slug | brand | hostname | app |
|---|---|---|---|
| **red-demo** | **red** | **red-demo.localhost** | **admin** |
| forge | forge | forge.localhost / red-2-0-admin.vercel.app | admin |

So any host/slug that maps to `brand_module_id = red` makes the **admin** render the RED `loginAnimation`.

**Option A — RED admin host (host-wins, most production-faithful):**
1. `pnpm --filter admin dev` (admin runs on port 3000).
2. Visit `http://red-demo.localhost:3000/login` (browsers auto-resolve `*.localhost`; `resolveTenant` strips the port).
3. Proxy stamps `x-brand=red` → the login page mounts `brands.red.loginAnimation`. **Today** = the chevron ignition; **after Slice 5** = the neon ring — the *same URL* is your regression/verify path.

**Option B — `?gym=` override (no host needed):**
1. `pnpm --filter admin dev`.
2. Visit `http://localhost:3000/login?gym=red-demo` — `localhost` has no `gym_domain` row, so the override arm validates the real slug `red-demo` → brand `red`. Same RED hero. (On a *mapped* host the override is inert; plain `localhost` is unmapped, so it engages.)

**Client-side test:** `http://red.localhost:3000/entrar` (or `/registro`) for the login hero, and `/` once the widened `logo{animate}` is wired for the landing ring.

**Reduced-motion check:** toggle OS "reduce motion" → confirm the ring lands fully-drawn and lit (via `packages/ui/src/motion.css:64-72`).

> Testing the *animation* does not require the dark-mode fix (Doc 1 Slice 1), but the neon reads best on dark — enable dark to judge fidelity.
