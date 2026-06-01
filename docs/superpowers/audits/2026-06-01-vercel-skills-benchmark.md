# Forge ⟶ Vercel Skills Benchmark Audit (3-skill harness run)

**Date:** 2026-06-01
**Method:** A new harness run — spin up three vendored Vercel reference skills one at a
time *in the main session* (skills cannot be loaded inside dispatched subagents), and for
each, audit Forge's **actual `src/`** against every applicable rule, recording concrete
conformance / violations at real `file:line`. This is the "audit the OUTPUT before codifying
the PROCESS" discipline (Operating discipline §1) applied with an *external* rule set as the
lens, rather than our own architectural lenses.

**The three skills (all symlinked from `.agents/skills/`, freshly vendored, untracked):**
1. `vercel-react-best-practices` — 72 rule files, 8 categories, 108 KB compiled (performance).
2. `vercel-composition-patterns` — React composition / component-API design.
3. `vercel-react-native-skills` — React Native + Expo mobile performance.

**Scope of the audited surface:** Forge is a compact Next 16 / React 19 App Router gym-admin
app — ~30 source files under `src/`: 6 RSC `page.tsx` + 1 auth, ~12 `src/lib/data/*` DAL
modules, a pure `src/domain/*` core, ~7 `_components` client screens, ~8 `src/components/forge/*`
UI primitives.

**Severity legend:** `CONFORMS` (already follows the rule) · `INFO` (rule is N/A or
conforms-by-absence; noted for completeness) · `LOW` · `MEDIUM` · `HIGH` (none found).
No correctness bugs were found by any rule in this run — every finding is performance/hygiene.

**Disposition:** This doc is the raw per-skill audit. After all three skills are recorded, the
durable learnings get distilled into the project's real findings infra
(`harness-learnings.md` ledger + `shipping-skill-registry.md`) for GOAL B — the back-half
shipping skill is authored in a *later* session, not here.

**Remediation status (2026-06-01):** all actionable findings below were applied to Forge in
commit `489efa7` (`perf(web): apply Vercel-skills benchmark findings`) — behavior/visual/UX-
identical, no PRD/issues warranted (a quality pass, not a feature slice). Tier A (Intl/regex
hoist, `toSorted`, GPU `transform` animations), Tier B (`useMemo` collection derivations,
`React.memo`+stable-callbacks for the pase rows), Tier C (vender accordion effects→events),
Tier D (`crearVenta` paquete+cliente `Promise.all`; documented the deliberate ficha waterfall).
Implemented via 5 parallel Opus subagents over disjoint files; full gate green
(lint + typecheck + test 93/93 + build). Two items intentionally NOT changed: `crearVenta`'s
post-RPC perfil/plantilla reads (D1(b) — left after the atomic money-write), and the
`getClienteFicha` waterfall (justified — comment only). Out of scope (separate Gate 3.1
concept-duplication item, not a Vercel finding): `cuenta.tsx` re-implements `iniciales()` inline.
**Caveat:** the GPU-animation swaps (`scaleX`/`scaleY`) are CSS equivalences the gate can't see —
recommend a quick visual smoke before treating them as verified.

---

## Skill 1 — `vercel-react-best-practices` (72 rules / 8 categories)

### Headline verdict

Forge **conforms strongly on all three CRITICAL/HIGH categories** — Eliminating Waterfalls,
Bundle Size, and Server-Side Performance — which is precisely where the architecture audit
said "the harness got it right" (RSC + `Promise.all` + `cache()`). The RSC-first +
`server-only` DAL discipline *structurally eliminates* whole rule families (all client-side
data-fetching rules become N/A). **Every gap is concentrated in the MEDIUM Re-render category**
(there is essentially **no client re-render hygiene anywhere**: one `useMemo`, zero `useCallback`,
zero `React.memo` in the whole tree) plus two LOW micro-waterfalls and two LOW JS-idiom items.
None is a correctness defect; all are calibrated-to-modest-impact on a small-dataset mobile app.

### 1. Eliminating Waterfalls (CRITICAL) — CONFORMS, with 2 LOW findings

| Rule | Verdict | Evidence | Note |
|---|---|---|---|
| `async-parallel` | CONFORMS | `inicio/page.tsx:10` (3-way `Promise.all`), `vender/page.tsx:7`, `resumen.ts:27`, `clientes.ts:84` (`getClientesRoster`), `clientes.ts:149` (ficha inner 5-way batch), `ventas.ts:156` | Independent reads are consistently parallelized. |
| `async-suspense-boundaries` | INFO | RSC pages `await` at the top and pass resolved props; no streaming `<Suspense>` used | Acceptable for a fast app shell; streaming is an available lever, not a gap. |
| `async-defer-await` / `server-parallel-fetching` | **LOW** | `clientes.ts:142-165` (`getClienteFicha`) | The cliente row is awaited **first** (`maybeSingle`), *then* 5 reads fire in `Promise.all`. Those 5 only need `id` (from params), not the row — so they *could* join the first batch (1 round trip vs 2). **Justified trade-off:** serializing avoids 5 wasted queries on a 404 (`notFound`). Worth a one-line comment naming the trade-off; not worth changing on a detail page. |
| `async-api-routes` ("start early, await late") | **LOW** | `ventas.ts:89-94` then `:113-119` (paquete then cliente sequential); `:156-159` (perfil + recibo plantilla start only *after* the RPC, though they don't depend on it) | Write path: paquete + (existing) cliente reads are independent → could be one `Promise.all`; perfil/plantilla could start at function top. Single-user action, low impact — but a clean `async-api-routes` exemplar to tighten. |

### 2. Bundle Size Optimization (CRITICAL) — CONFORMS

| Rule | Verdict | Evidence | Note |
|---|---|---|---|
| `bundle-barrel-imports` | CONFORMS | `export *` / re-export barrels: **none** (grep clean). `@/components/forge/ui` is a flat multi-export module (`ui.tsx`), not a re-export barrel — direct, statically analyzable. | The dep tree is lean: `clsx`, `tailwind-merge`, `next-themes`, `sonner`, `zod` — no lodash/moment/date-fns/icon-library. Icons are a hand-rolled `icon.tsx`. |
| `bundle-analyzable-paths` | CONFORMS | All imports are static `@/…` paths; no dynamic-string requires. | |
| `bundle-dynamic-imports` | INFO | `next/dynamic`: **zero usages** | Conforms-by-absence — there is no heavy component (no chart, editor, map). *Forward note:* the first heavy widget (e.g. a chart in `cuenta`/resumen) should be `next/dynamic`'d. |
| `bundle-defer-third-party` | INFO | No analytics/logging SDK in the tree | N/A today. |

### 3. Server-Side Performance (HIGH) — CONFORMS

| Rule | Verdict | Evidence | Note |
|---|---|---|---|
| `server-cache-react` | CONFORMS | `cache(async (client?) => …)` on **every** DAL read: `clientes.ts:35,59,79,111,136`, `resumen.ts:18`, etc. | Textbook per-request dedup. |
| `server-serialization` / `server-dedup-props` | CONFORMS | DALs return shaped DTOs (`ClienteLiteDTO`, `ResumenMes`, `FichaDerivada`), not raw rows; pages pass minimal props (`inicio/page.tsx:19-25`) | Minimal client payload. |
| `server-hoist-static-io` | CONFORMS | `next/font` `Outfit` at module scope (`layout.tsx:9`), `display:"swap"` | Font I/O hoisted; no per-request static I/O. |
| `server-auth-actions` | CONFORMS | `crearVenta` re-checks operator (`ventas.ts:86 requireOperator`); RLS is the hard boundary (ADR-0001); write RPC is `SECURITY INVOKER` | Auth at the seam, not trusted from client. |
| `server-no-shared-module-state` | CONFORMS | No module-level mutable request state; `hoyChihuahua()` resolved per-call | |
| `server-after-nonblocking` | INFO | `after()` not used | No fire-and-forget work to defer; N/A. |

### 4. Client-Side Data Fetching (MEDIUM-HIGH) — N/A by architecture

| Rule | Verdict | Note |
|---|---|---|
| `client-swr-dedup` | INFO | **The whole category is N/A.** Forge does *no* client-side fetching — data flows RSC → props; mutations go through server actions (`crearVentaAction`, `togglePaseAction`) with optimistic local `setState` (`asistencia.tsx:49`). This is itself a finding: the RSC-first design sidesteps the entire SWR/dedup rule family. |
| `client-event-listeners` / `client-passive-event-listeners` | INFO | No global `window` scroll/wheel/touch listeners. `asistencia.tsx` DayStrip uses **pointer** events (`onPointerDown/Move`, `:184-192`) for click-drag — passive-listener rule targets scroll/touch/wheel, so N/A. |
| `client-localstorage-schema` | INFO | No `localStorage` schema beyond `next-themes` (library-managed). |

### 5. Re-render Optimization (MEDIUM) — **the gap cluster**

> The single load-bearing observation of this skill: the entire codebase has **1 `useMemo`,
> 0 `useCallback`, 0 `React.memo`** (`asistencia.tsx:28` is the lone memo). On a small gym
> roster the impact is modest, so this is hygiene rather than a defect — but it is a real,
> uniform gap, and a ready-made candidate for a back-half "client re-render hygiene" gate.

| Rule | Verdict | Evidence | Recommendation |
|---|---|---|---|
| `rerender-memo` (extract expensive work into memoized components) | **MEDIUM** | `clientes.tsx:35-52` — `withU` (`.map` + `urgenciaCliente` per client) + the filter chain + `[...list].sort` recompute on **every** render, including unrelated state changes (toggling `showFilters` at `:29`, every search keystroke at `:28`). | Memoize `withU` keyed on `clientes`, and the filtered/sorted `list` keyed on the filter/sort state, so a `showFilters` toggle doesn't re-derive urgency for the whole roster. |
| `rerender-memo` (list items) | **MEDIUM** | `asistencia.tsx:128-137` renders `PaseRow` per client; `PaseRow` (`:246`) is **not** `React.memo`'d, so every attendance toggle (`marcadas` change at `:49`) re-renders **all** rows. `DayStrip` (`:162`) rebuilds its ~104-cell loop (`:195-229`) on every parent render. | `React.memo(PaseRow)` (only the toggled row's `present` changes); consider memoizing the DayStrip cell list. |
| `rerender-move-effect-to-event` | **MEDIUM** | `vender.tsx:71-88` — **three** `useEffect`s + `setTimeout` + an `advanced` ref drive accordion auto-advance off derived validity (`clienteValid`/`sel`/`metodo`). | This is interaction logic reacting to user input; Vercel's guidance is to put it in the change handlers. The `advanced` fire-once ref (`:70,117`) is the tell that effects are doing event work. Non-trivial to refactor (validity is multi-input-derived) but the canonical example of this rule. |
| `rerender-lazy-state-init` | CONFORMS | `asistencia.tsx:31` `useState<Date>(() => parseDay(hoyIso))` — lazy initializer used correctly. | Nice — already idiomatic. |
| `rerender-derived-state-no-effect` | CONFORMS | Filters/sort/counts in `clientes.tsx` are derived **during render**, not synced via effects. | The expensive-recompute gap above is orthogonal to this rule, which Forge passes. |
| `rerender-no-inline-components` | CONFORMS | `FacetRow`, `AccordionSection`, `PaseRow`, `DayStrip`, `Recibo` are all module-scope, not defined inside their parents. | |
| `rerender-use-ref-transient-values` | CONFORMS | `count-up.tsx:19` `fromRef`; `asistencia.tsx:183` drag ref hold transient values off render. | |

### 6. Rendering Performance (MEDIUM) — CONFORMS (one nuance)

| Rule | Verdict | Evidence | Note |
|---|---|---|---|
| `rendering-conditional-render` ("ternary, not `&&`") | CONFORMS (in substance) | Forge uses `&&` pervasively (`clientes.tsx:102,114,141`; `asistencia.tsx:285`; `vender.tsx:187`; etc.) **but every left operand is a genuine boolean** (`activeCount > 0`, `showFilters`, `list.length === 0`, `c.porVencer`, `isNew`). | The rule exists to prevent the `{0 && <X/>}` → renders `0` footgun. Forge **never** has a raw-number/length left operand, so the correctness risk is absent. Technically the blanket "use ternary" style is not followed; substantively it is safe. Worth a one-line lint note, not a refactor. |
| `rendering-hydration-suppress-warning` | CONFORMS | `layout.tsx:36` `suppressHydrationWarning` on `<html>` for next-themes, **with a comment** explaining why. | Exemplary. |
| `rendering-content-visibility` | INFO/LOW | Client lists (`clientes.tsx:170`, `asistencia.tsx:128`) render all rows; no `content-visibility:auto` or virtualization. | Fine at gym-roster scale; a lever if rosters grow into the hundreds. |
| `rendering-hoist-jsx` | CONFORMS | Static structural JSX is not rebuilt from props in hot paths beyond the data-driven lists. | |
| `rendering-script-defer-async` / `rendering-resource-hints` | INFO | No manual `<script>` tags; `next/font` handles font preload. | N/A. |

### 7. JavaScript Performance (LOW-MEDIUM) — CONFORMS (2 LOW idioms)

| Rule | Verdict | Evidence | Note |
|---|---|---|---|
| `js-tosorted-immutable` | **LOW** | `clientes.tsx:52` `[...list].sort(sorters[sort])` | React 19 / modern runtime supports `list.toSorted(sorters[sort])` — drops the spread copy. Pure idiom polish. |
| `js-hoist-regexp` | **LOW** | `format.ts:33` (`/\D/g`), `:8,18` (`/\s+/`), `vender.tsx:136` inline `/\D/g` | Regex literals re-evaluated per call; not in hot loops, so negligible. Hoisting `/\D/g` to a module const is tidy, not impactful. |
| `js-index-maps` | CONFORMS | `clientes.ts:99-100` builds a `counts` map for asistencia tallies instead of repeated `.filter`. | |
| `js-early-exit` | CONFORMS | DAL reads return early on `!data` / `!c` throughout. | |

### 8. Advanced Patterns (LOW) — INFO

| Rule | Verdict | Note |
|---|---|---|
| `advanced-init-once`, `advanced-use-latest`, `advanced-event-handler-refs`, `advanced-effect-event-deps` | INFO | No app-wide init beyond `Providers`; no stale-closure callback patterns that need `useLatest`/handler-refs. N/A. |

### Skill 1 — cross-cutting takeaway (for later distillation)

- **What the harness structurally gets right is the expensive half.** The RSC-first +
  `server-only` DAL + `Promise.all` + `cache()` shape makes the three CRITICAL/HIGH Vercel
  categories *pass by construction*, and nullifies the entire client-data-fetching family.
  This is strong external corroboration of the registry's "got right" list.
- **The one uniform blind spot is client re-render hygiene** (Re-render category): no
  memoization discipline anywhere, and one clear `move-effect-to-event` case. It maps cleanly
  to registry **Gate 3.6 ("stack-aware default rule set")** — a candidate back-half gate:
  *"list-item components over a roster get `React.memo`; per-render derivations over a collection
  get `useMemo`; interaction logic lives in handlers, not effects."* Calibrated to "good-enough"
  (small datasets) it's advisory, not blocking.
- **No rule surfaced a correctness bug** — consistent with three prior architecture passes
  having already hardened the domain/contract axes the dependency boundary can't see.

---

## Skill 2 — `vercel-composition-patterns` (7 rules / 4 categories)

### Headline verdict

Forge **broadly conforms** to every composition rule. It already uses the patterns this skill
prescribes as the *fix* for boolean-prop sprawl: **string-union `variant`/`size`/`state` props**
(not boolean modes), **`children` + ReactNode slots** (not render props), and **lifted state**
threaded to siblings. It does **not** use compound components or custom context-interface DI —
but the skill's anti-patterns (exponential boolean-mode components, render-prop callbacks,
`forwardRef` ceremony, monolithic-parent state) are **absent**, so those are calibration choices
appropriate to the app's size, not gaps. This is a genuinely thin audit: a 7-rule composition
skill against a small, already-well-factored component layer yields mostly `CONFORMS`. Two
forward-looking notes only; no MEDIUM+ findings.

### 1. Component Architecture (HIGH) — CONFORMS

| Rule | Verdict | Evidence | Note |
|---|---|---|---|
| `architecture-avoid-boolean-props` | CONFORMS | Boolean props (`?: boolean` grep) are all **orthogonal styling toggles**, never behavioral-mode selectors: `Card` padded/raised/glow (`ui.tsx:76-78`), `Avatar` accent (`:158`), `Button` disabled/full (`:218-219`), `AppBar` accent (`:340`), `TabItem` primary (`tab-bar.tsx:11`), `AccordionSection` last (`vender.tsx:250`). | The anti-pattern is `isThread`/`isEditing`/`isForwarding` booleans that branch into **different sub-structures** and create impossible states. Forge has none — densest is `Card`'s 3 independent style bools, all valid in any combination. |
| `architecture-compound-components` | INFO (forward note) | No compound-component-with-context pattern anywhere. | The one real candidate is `vender.tsx`'s `AccordionSection` (`:160-170`), where `open`/`onToggle`/`complete` are hand-threaded to each of 3 sections. A `<Accordion>/<Accordion.Section>` with shared context would remove the threading — but the parent needs `openSection` for the auto-advance logic anyway, and at **3 sections** the prop-threaded form is the right call. The pattern becomes worth it if a Composer-like form family grows. |

### 2. State Management (MEDIUM) — CONFORMS

| Rule | Verdict | Evidence | Note |
|---|---|---|---|
| `state-lift-state` | CONFORMS | State is consistently lifted to the screen and threaded to children for sibling coordination: `clientes.tsx:28-33` (query/filters → `FacetRow` + list), `vender.tsx:35-44` (mode/sel/metodo/openSection → editors + footer + accordion), `asistencia.tsx:30-33` (selDate/marcadas → DayStrip + PaseRow + PaseCalendar + header stat). | Textbook lifted state. |
| `state-decouple-implementation` | CONFORMS (by example) | `theme-toggle.tsx:13` consumes `useTheme()` and is fully ignorant of how/where theme state is stored — the `next-themes` provider is the only place that knows. | Exemplifies the rule via the one provider in the app. |
| `state-context-interface` | INFO | No custom `{state, actions, meta}` context interface exists. | N/A — there is no shared cross-cutting **client** state complex enough to warrant provider-based DI. Introducing it here would be premature abstraction. (Server state lives in the RSC/DAL layer, not client context.) |

### 3. Implementation Patterns (MEDIUM) — CONFORMS

| Rule | Verdict | Evidence | Note |
|---|---|---|---|
| `patterns-children-over-render-props` | CONFORMS | `render[A-Z]*` prop grep: **none**. Composition is via `children` (`Card`, `Sheet`, `AccordionSection`) and **ReactNode slots** (`AppBar` `center`/`trailing` `ui.tsx:331`; `SectionHeader` `trailing` `:303`). | ReactNode slots are the endorsed form — no `renderTrailing={() => …}` callbacks. |
| `patterns-explicit-variants` | CONFORMS | `Button` uses a `variant` string union (`ui.tsx:181`), `Badge` a `state` union (`:108`), `Segmented<T>` is generic + items-driven. | These are **presentation tokens** (color/style), not structurally-different components — so a `variant` union is the correct tool. The rule's "explicit variant components" target is *structural/behavioral* variants, which Forge never collapses into boolean modes. |

### 4. React 19 APIs (MEDIUM) — CONFORMS (one INFO)

> React 19.2.4 is in use, so this section applies.

| Rule | Verdict | Evidence | Note |
|---|---|---|---|
| `react19-no-forwardref` | CONFORMS | `forwardRef` grep: **none**. `useContext` grep: **none** (Forge uses `useTheme`/`usePathname`/`useRouter`, no raw context). | Forge already avoids the `forwardRef` ceremony the rule targets, and has no `useContext` to convert to `use()`. |
| (ref-as-prop opportunity) | INFO | UI primitives (`Input` `ui.tsx:254`, `Button`, `Card`) expose **no** `ref` at all. | React 19 makes ref-forwarding free (pass `ref` as a normal prop, no `forwardRef`). Forge doesn't yet use this — fine until something needs imperative focus (it relies on `autoFocus`). If a primitive later needs programmatic focus/measure, add `ref?: React.Ref<…>` directly — no `forwardRef`. |

### Skill 2 — cross-cutting takeaway (for later distillation)

- **Forge is already on the "right side" of every composition rule** — it reaches for the
  exact patterns the skill prescribes as fixes (variant unions, slots/children, lifted state)
  rather than the anti-patterns. This is a clean *positive* exemplar to cite, not a source of
  fixes.
- **Calibration is the lesson, not a gap:** the app deliberately stops short of compound
  components and context-DI, and that restraint is correct for its size ("good-enough that
  showcases the harness, not perfection"). The back-half skill should frame these HIGH/MEDIUM
  composition patterns as **scale-triggered levers** ("reach for compound components when a
  component family proliferates boolean modes or threads the same state through 4+ children"),
  not as always-on gates — otherwise it would mandate premature abstraction.
- **Net for the harness:** composition-patterns adds little as a *gate* here (nothing to fix),
  but is valuable as a **review lens / vocabulary** — a fresh-eyes Elegance gate (registry
  Section 4) could cite `architecture-avoid-boolean-props` by name when a future slice starts
  growing boolean modes on a component.

---

## Skill 3 — `vercel-react-native-skills` (~30 rules / 8 categories)

### Headline verdict

**~70% of this skill is N/A by platform.** Forge is a Next.js *web* app (package.json has
**zero** `react-native`/`expo`/`reanimated` deps — the only matches in-repo are the vendored
skill's own metadata). So the platform-specific majority — FlashList, expo-image, Galeria,
Reanimated, Gesture Detector, native stack/tabs navigators, native modals/menus, native
modules, monorepo native-dep hygiene, expo font config plugins — **cannot apply** and is not
a gap. Recording that honestly is itself the finding: do **not** manufacture applicability.

The skill's *residual value* against Forge is a **second mobile-performance lens** over the
same client surface skill 1 covered. It mostly **reinforces skill 1's re-render gap** (list-item
memo, callback stability) and contributes **two net-new web-applicable findings**: a `js-hoist-intl`
cluster and one non-GPU `width` animation. `rendering-no-falsy-and` is an exact duplicate of
skill 1's `rendering-conditional-render` (same CONFORMS-in-substance verdict).

### Category-by-category disposition

| Category | Disposition | Detail |
|---|---|---|
| **1. List Performance (CRITICAL)** | Mixed — platform-N/A core + transferable principles | `list-performance-virtualize` (FlashList) is RN-only; the **web analogue** (`content-visibility`/virtualization) was already logged in skill 1 §6 (INFO/LOW). `list-performance-item-memo` and `-callbacks` **transfer directly and reinforce skill 1's MEDIUM finding** — `PaseRow` (`asistencia.tsx:246`) unmemoized, callbacks unstable. **`list-performance-inline-objects` adds a new wrinkle:** Forge passes inline `style={{…}}` objects to every list row (`clientes.tsx:180`, `asistencia.tsx:264`), creating fresh object identities each render — on web this is cheap (no native bridge) but it **defeats any future `React.memo`** on those rows. So the inline-style angle is the reason memoization must pair with stable style refs. |
| **2. Animation (HIGH)** | One transferable finding | `animation-gpu-properties` (animate only `transform`/`opacity`) **applies to web CSS too**. Forge is mostly GPU-clean: `transform: scale`/`translateY`/`rotate` (recibo check `vender.tsx:447`, sheet `sheet.tsx:50`, accordion chevron `vender.tsx:270`) and `opacity`. **The one exception: the progress bar animates `width`** (`asistencia.tsx:109` `transition:"width 380ms…"`), which triggers layout/paint, not just compositing. **Fix (LOW):** animate `transform: scaleX()` off a fixed-width track instead. Minor also: `tab-bar.tsx:40` `transition-all` animates more properties than needed. Reanimated/derived-value/gesture rules are RN-only. |
| **3. Navigation (HIGH)** | N/A by platform (web analogue conforms) | `navigation-native-navigators` is RN-only. Forge's web-correct equivalent — `next/link` + App Router (`tab-bar.tsx:3,32`), `useRouter().push` for programmatic nav — is idiomatic. CONFORMS-by-analogue. |
| **4. UI Patterns (HIGH)** | Mostly N/A by platform | `ui-expo-image`/`ui-image-gallery`/`ui-pressable`/`ui-native-modals`/`ui-menus`/`ui-measure-views` are RN-only. Web analogues Forge handles: `ui-styling` → Tailwind + tokens (used throughout); `ui-safe-area-scroll` → the tab bar's manual `22px` bottom inset (`tab-bar.tsx:27`) is the hand-rolled safe-area; the proper web analogue would be `env(safe-area-inset-bottom)` (INFO). `Sheet` is a custom JS modal — on web that's the only option (no native modal), so N/A not a gap. |
| **5. State Management (MEDIUM)** | Transferable, conforms | `react-state-minimize` (minimize subscriptions) — `clientes.tsx`'s 6 `useState` are genuinely independent filter dimensions, not over-subscription. `react-state-dispatcher` overlaps skill 1's `rerender-functional-setstate`; Forge already uses functional `setState` (`asistencia.tsx:49`, `clientes.tsx:91`). React-Compiler rules are advisory (no compiler configured). CONFORMS. |
| **6. Rendering (MEDIUM)** | Duplicate of skill 1 | `rendering-no-falsy-and` = skill 1's `rendering-conditional-render`: Forge's `&&` are all boolean-guarded → safe, CONFORMS-in-substance. `rendering-text-in-text-component` is RN-only (web text in `<span>`/`<div>` is valid); N/A. |
| **7. Monorepo (MEDIUM)** | N/A | Forge is a single package, not a monorepo. Both rules N/A. |
| **8. Configuration (LOW)** | One transferable finding | `fonts-config-plugin` is expo-only (Forge uses `next/font` — web analogue handled, `layout.tsx:9`). `imports-design-system-folder` → Forge's `src/components/forge/*` imported via `@/components/forge/*` is a clean design-system folder; CONFORMS-by-analogue. **`js-hoist-intl` applies directly and is the most actionable finding here:** `fecha.ts:17,44` create `new Intl.DateTimeFormat("en-CA", {…})` **fresh on every call** (server-side, per request, in the date path), and `.toLocaleString("es-MX")` is called inline in render in 8 sites (`vender.tsx:64,180,185,365,490,511`, `cuenta.tsx:133,190`, `inicio.tsx:114`) + `format.ts:4 pesos()`. **Fix (LOW):** hoist a module-level `Intl.NumberFormat`/`Intl.DateTimeFormat` const and reuse — the canonical `js-hoist-intl` pattern. |

### Skill 3 — cross-cutting takeaway (for later distillation)

- **The honest headline is "wrong platform, partial lens."** A RN/Expo skill against a Next.js
  web app is mostly inapplicable, and the audit says so plainly rather than stretching rules to
  fit. *Skill implication for the back-half:* a stack-aware harness must **gate which rule packs
  even apply** to a project's platform before running them — running an RN skill on web produces
  ~20 N/A rows for 3 real findings.
- **Where it overlaps web, it independently re-found skill 1's gap.** Two separate Vercel skills
  converging on "memoize list items + stabilize callbacks" is strong corroboration that the
  client re-render hygiene gate is the one worth adding.
- **It contributed two net-new, genuinely web-applicable items** the React-perf skill didn't
  emphasize: hoist `Intl` formatters (`fecha.ts`, `format.ts`), and prefer `transform` over
  `width` for the progress animation. Both LOW, both real, both calibrated-advisory.

---

## Cross-skill synthesis (the 3-skill harness result)

**One-line result:** across 110+ rules from three Vercel skills, Forge surfaced **zero
correctness bugs and zero HIGH findings** — every hit is performance/composition *hygiene*,
and they cluster into **one** theme.

### The single convergent finding

**Client-side re-render hygiene is Forge's one uniform blind spot**, and it was found
independently by **two** of the three skills:
- `vercel-react-best-practices` §5 (Re-render): no `React.memo`/`useCallback`, one `useMemo`
  tree-wide; per-collection derivations recompute on unrelated state; one `move-effect-to-event`
  case (`vender.tsx`).
- `vercel-react-native-skills` §1 (List Performance): same — unmemoized list items + unstable
  callbacks, plus the **inline-style-object** wrinkle that explains *why* memoization needs
  stable style refs to actually pay off.

Everything else is either **CONFORMS** (the CRITICAL/HIGH web categories — waterfalls, bundle,
server, composition) or **N/A** (client-fetching family; the RN platform majority).

### What this validates about the harness

- The front-half/`sector-map` + RSC-first + `server-only` DAL + `Promise.all` + `cache()`
  discipline **passes the expensive Vercel categories by construction** — independent external
  corroboration of the architecture audit's "got right" list.
- Forge already reaches for the **composition** patterns these skills prescribe as fixes
  (variant unions, slots, lifted state) — a clean positive exemplar.

### Candidate inputs for GOAL B (to distill into the ledger + registry — NOT done here)

1. **A "client re-render hygiene" lens for the back-half skill** — maps to registry **Gate 3.6
   (stack-aware default rule set)**. Advisory, scale-triggered (calibrated to dataset size), not
   blocking: *list-item components over a roster get `React.memo` + stable callbacks + stable
   style refs; per-collection derivations get `useMemo`; interaction logic lives in handlers, not
   effects.*
2. **A "rule-pack applicability gate"** — the harness must select rule packs by the project's
   **platform/stack** before auditing (an RN skill on a web app is ~90% noise). A small but real
   process lesson.
3. **Composition-patterns as a fresh-eyes *review vocabulary*** (registry Section 4 Elegance
   gate), not a standing gate — cite `architecture-avoid-boolean-props` by name when a slice
   starts growing boolean modes.
4. **Two micro-mechanics** worth a one-liner in the skill's "execution mechanics": hoist `Intl`
   formatters; animate `transform` not `width`/layout props.

> **Done (this session, per the agreed plan):** items 1–4 above are distilled into
> `harness-learnings.md` (dated triplet entry "2026-06-01 (cont.) — external-benchmark harness")
> and cross-referenced into `shipping-skill-registry.md` (Gate 3.6 "Extended (2026-06-01…)" +
> the benchmark audit added to the canonical sources). The skill itself is authored in a later
> `write-a-skill` session — this doc + the ledger entry are its inputs.

