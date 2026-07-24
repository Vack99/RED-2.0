# What THIS Next.js says about route loading states

2026-07-22. Read-only recon before anyone writes more `loading.tsx` files. Every claim below is cited to a file under `node_modules/next/dist/docs/` in this worktree (Next 16.2.6) — not to training-data memory of "standard" Next.js.

## Version

`node_modules/next/package.json` → **`next@16.2.6`**. React peer range `^18.2.0 || 19.0.0-rc... || ^19.0.0`; App Router actually runs on the React 19.2 canary per the upgrade guide (View Transitions, `useEffectEvent`, `Activity`).

Neither `apps/admin/next.config.ts` nor `apps/client/next.config.ts` sets `cacheComponents`. **Cache Components / PPR is OFF in this repo.** This matters a lot below — most of the docs' "with Cache Components" branches do not apply to us; we're on the plain-Suspense/classic-streaming code path.

## Facts (doc-path cited)

1. **`loading.tsx` exists, unchanged, as a special file.** Special-file list is still `layout`, `template`, `error`, `loading`, `not-found`, `page`/`route` — no renames.
   `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md:196-201`

2. **What it wraps / semantics.** `loading.js` is nested inside `layout.js` and automatically wraps `page.js`, `not-found.js`, and any nested `layout.js` in a `<Suspense>` boundary. It does **not** wrap `layout.js`, `template.js`, or `error.js` in the *same* segment.
   `.../01-app/03-api-reference/03-file-conventions/loading.md:78-95` (component-hierarchy diagram), confirmed by the ordered list in `.../01-app/01-getting-started/02-project-structure.md:192-201`:
   ```
   layout.js
   template.js
   error.js        (React error boundary)
   loading.js       (React suspense boundary)
   not-found.js      (React error boundary)
   page.js  or nested layout.js
   ```
   So the render order top→bottom is layout → template → error boundary → Suspense(loading) → not-found boundary → page. It replaces only the page-segment subtree; ancestor layouts stay mounted and interactive (`.../loading.md:44-49`: "Shared layouts remain interactive while new route segments load").

3. **`loading.js` DOES render inside `template.js`** — confirmed directly, twice:
   - `template.md:47`: "`template.js` renders between `layout.js` and `error.js`... It wraps `error.js`, `loading.js`, `not-found.js`, and `page.js`, but does **not** wrap the `layout.js` in the same segment."
   - Component hierarchy list above puts `template.js` above `loading.js`.
   So the *component-hierarchy* claim in this repo's precedent comment is doc-confirmed: `loading.tsx` is literally inside `<Template>` in the tree.

   **But** whether that produces a *replayed CSS enter animation on a given navigation* is a separate question — see Deviations #1 below. Hierarchy nesting ≠ remount.

4. **Streaming / granular Suspense vs whole-route `loading.js`** — the docs have an explicit decision table:
   `.../01-app/02-guides/streaming.md:373-382` ("When to use `loading.js` vs `<Suspense>`"):
   | | `loading.js` | `<Suspense>` |
   |---|---|---|
   | Scope | Entire page | Any component |
   | Navigation | Prefetched as instant fallback | Not prefetched by default |
   | Best for | Pages where nothing renders without data | Most pages, for granular control |
   Recommendation: "Prefer explicit `<Suspense>` boundaries close to the dynamic access... A `loading.js` high in the tree is a valid boundary... but now the entire page falls back to a full-page skeleton instead of streaming granularly." `loading.js` is explicitly framed as the coarse/legacy-feeling option, granular `<Suspense>` as the preferred pattern for anything with independently-resolving sections (`streaming.md:119-243`, parallel + nested boundary examples).

5. **Layout data access can silently defeat `loading.js`.** If the *layout* itself does uncached/runtime work (`cookies()`, `headers()`, uncached `fetch`), `loading.js` cannot show a fallback for it, because loading sits *below* layout in the hierarchy:
   `.../03-file-conventions/layout.md:316-328` ("Interaction with `loading.js`") — **without Cache Components** (our case): "navigation will block until the layout finishes rendering, and the `loading.js` fallback will not be shown." Fix: move the uncached fetch into `page.js`, or wrap it in its own `<Suspense>` in the layout.
   Also restated in `.../03-file-conventions/loading.md:90-95`.

6. **Prefetch interplay.** Dynamic pages are *not* prefetched in full — only up to the nearest `loading.js` boundary, whose fallback is what gets prefetched and shown "instantly" on click:
   `.../01-app/02-guides/prefetching.md:20-28` (table: Prefetched — "No, unless `loading.js`").
   Client Router Cache duration differs with/without a `loading.js`:
   `.../02-guides/prefetching.md:54-55`: no `loading.js` → cached "Until app reload"; with `loading.js` → cached "Layout to first loading boundary", default **30s** (configurable via `staleTimes`).

7. **Scoping `loading.js` to one route without touching siblings** is a documented pattern: wrap the target route in its own route group and put `loading.tsx` inside that group.
   `.../01-app/01-getting-started/02-project-structure.md:395`.

8. **`error.tsx` boundary shape changed its recovery API.** `v16.2.0` added `unstable_retry` (re-fetches and re-renders the segment) as the recommended recovery action; `reset()` still exists but the docs now say "In most cases, you should use `unstable_retry()` instead."
   `.../03-file-conventions/error.md:117-157` and Version History table `error.md:325-332`.
   There's also a new non-route-scoped error API, `unstable_catchError` from `next/error`, for component-level error boundaries that aren't tied to a route segment.
   `.../error.md:94, 281-320`; `.../01-app/01-getting-started/10-error-handling.md:281-320`.

9. **`unstable_instant` route-segment config** — a fork-specific/new (v16.x) export that validates, at dev-time and build-time, that a route's Suspense/caching structure produces an instant static shell at every navigation entry point. It **only works when `cacheComponents` is enabled** (which this repo does not enable) and throws if used in a Client Component.
   `.../03-file-conventions/02-route-segment-config/instant.md:15-20, 134-138`; walkthrough in `.../01-app/02-guides/instant-navigation.md`.
   AI-agent hints embedded directly in the doc source flag this repeatedly: `loading.md:6` and `streaming.md:15` both say "Suspense alone does not guarantee instant client-side navigations. Always export `unstable_instant` from routes that should navigate instantly" — **but that guidance only bites once `cacheComponents: true` is set.** Until then it's inert advice, not something to add speculatively.

## Deviations from "standard" Next App Router (the AGENTS.md warning, made concrete)

1. **Template remount is now scoped to "its own segment level," not "every navigation below it."** This is the one that actually matters for the repo's precedent.
   `template.md:65`: "Templates receive a unique key for their own segment level. They remount when that segment (including its dynamic params) changes. **Navigations within deeper segments do not remount higher-level templates.**"
   The worked example (`template.md:70-156`) proves this precisely: a root-level `template.tsx` does **not** remount when navigating `/blog` → `/blog/first-post` (its own immediate child segment, `"blog"`, is unchanged) — only the *nested* `blog/template.tsx` remounts, because dynamic-param changes below a template's own level don't propagate up.

   **Applied to this repo:** `apps/admin/src/app/(app)/template.tsx` lives one level above `clientes/`. Its own immediate child segment is `"clientes"` (not `[id]`). Per the doc's rule, navigating from `/clientes` (roster list) to `/clientes/[id]` (detail) does **not** change that template's key — `"clientes"` is the direct child both times, the change happens one level deeper. So **the `(app)`-level template should NOT remount, and its inline `animation: forge-enter ...` should NOT replay**, on exactly the navigation `apps/admin/src/app/(app)/clientes/[id]/loading.tsx`'s own comment describes ("the `forge-enter` slide plays on THIS skeleton the instant the roster row is tapped"). It *will* remount on navigations that cross top-level `(app)` children (e.g. `inicio` → `clientes`, `agenda` → `cuenta`), because that changes the template's own immediate-child key.
   This is a refutation of the stated precedent, not a confirmation — see the Sanity-check section below.

2. **Middleware → proxy rename** (not loading-specific but a hard breaking change in the same file-convention family): `middleware.ts`/`middleware()` is deprecated in favor of `proxy.ts`/`proxy()`; the `edge` runtime is not supported under the new name.
   `.../01-app/02-guides/upgrading/version-16.md:625-671`.

3. **PPR's old flag is gone.** `experimental_ppr` and `experimental.dynamicIO` are both removed; the only lever now is the top-level `cacheComponents: true`, which is off here.
   `.../version-16.md:595-623, 1211-1233`.

4. **Async Request APIs are now unconditionally async** (no more synchronous fallback): `cookies()`, `headers()`, `draftMode()`, and `params`/`searchParams` in `page`/`layout`/`route`/`default`/image-metadata files must be awaited — the v15 synchronous-compat shim is fully removed in v16.
   `.../version-16.md:294-329`.

5. **Parallel-route slots now require an explicit `default.js`** (build fails otherwise) — not used in this app currently, but relevant if a loading/parallel-route combo is ever introduced.
   `.../version-16.md:942-962`.

6. **`revalidateTag` needs a second `cacheLife` argument now**; `unstable_cacheLife`/`unstable_cacheTag` dropped their `unstable_` prefix. Not loading-specific, but the kind of silent-signature-change the AGENTS.md warning is about.
   `.../version-16.md:453-465, 563-580`.

None of the "streaming"/"loading" *file-convention* semantics themselves (what `loading.js` wraps, when it shows, Suspense fundamentals) are altered from the App Router model as documented — deviation #1 (template remount granularity) is the one that actually changes how you'd reason about a loading fallback's *animation*, not its data-loading behavior.

## Sanity-check against the repo's actual code

- `apps/admin/src/app/(app)/clientes/[id]/loading.tsx` — a well-built skeleton mirroring `cliente-detalle.tsx`'s real layout (avatar/name header, PAQUETE ACTIVO gauge card, attendance control, WhatsApp row, 3 history rows). Structurally this is exactly what the docs recommend ("mirrors the final layout to avoid a jump," `loading.md`'s own examples do the same). **No problem with the skeleton itself.**

- The file's own doc-comment claims: *"Renders inside template.tsx, so the `forge-enter` slide plays on THIS skeleton the instant the roster row is tapped."*
  - "Renders inside template.tsx" — **doc-confirmed** (Fact #3 above: template wraps loading in the component hierarchy).
  - "the slide plays... the instant the roster row is tapped" — **not doc-confirmed; per Deviation #1, doc semantics say the opposite.** The only `template.tsx` in the app is at `(app)/template.tsx`, one level above `clientes/`. Tapping a roster row navigates `/clientes` → `/clientes/[id]`, which does **not** change that template's own-segment key (`"clientes"` stays constant; `[id]` is a level below the template's position), so the template should not remount, and the `animation:` inline style — which only fires on mount — should not replay on that click. It *will* have played once already, whenever the user's session first mounted the `(app)` template (e.g. right after login), and it will replay again on navigations that do cross the `(app)`-level segment boundary (e.g. `inicio` → `clientes`, `agenda` → `vender`).
  - This doesn't mean the loading.tsx is broken — the skeleton still swaps in correctly as the Suspense fallback, just without the wrapper's slide-in replaying. If the slide-in-on-every-client-detail-open effect is actually wanted, the fix per the docs (Fact #7 pattern) is to move (or add) a `template.tsx` down at the `clientes/` level, or inside a route group scoped to `clientes/[id]`, so the template's own key is tied to the `[id]` param change.

- `apps/admin/src/app/(app)/template.tsx` — client component, wraps `{children}` in a div with `animation: forge-enter ... both`. Matches the documented `template.js` convention shape (`children` prop, Server-or-Client-Component, default export) exactly. No convention violation; the only issue is the remount-granularity mismatch above, which is a *usage* gap, not a file-convention bug.

- Neither file references `cacheComponents`, `unstable_instant`, or Cache-Components-only behavior, which is correct — this repo doesn't enable that flag, so none of it is in play. `(app)/layout.tsx` does an uncached `await getOperatorGym()` — per Fact #5, on a cold/full load this blocks navigation and `loading.tsx` won't show a fallback for *that* wait; but layouts aren't re-executed by client-side navigation between siblings under an already-mounted layout, so this shouldn't recur on the roster-row-tap navigation itself.

- Confirmed via repo grep: this is still the *only* `loading.tsx` and the *only* `template.tsx` in the monorepo, and there is zero `<Suspense>` usage anywhere (`apps/`, `packages/`) — so there's no other precedent to cross-check against.

## Rules for authoring `loading.tsx` here

1. **Prefer `loading.tsx` for whole-page "nothing renders without the data" routes; prefer explicit `<Suspense>` for anything with independently-resolving sections** (own data, own timing). Docs explicitly recommend granular `<Suspense>` over a `loading.js` high in the tree (Fact #4).
2. **Don't let a route's `layout.tsx` do uncached/runtime work** (`cookies()`, `headers()`, un-cached `fetch`) if you want its child `loading.tsx` to actually show. Without Cache Components (our setup), that blocks navigation before the fallback ever appears (Fact #5). If a layout genuinely needs runtime data, wrap just that part in its own `<Suspense>`.
3. **Skeletons should mirror the real layout's structure/paddings** (the existing `clientes/[id]/loading.tsx` is the model to copy) — the docs' own examples do the same, and it avoids CLS on swap-in.
4. **Don't assume a shared `template.tsx` up the tree will replay its enter-animation for every deeper navigation.** A template only remounts when *its own* immediate child segment (or that child's dynamic param, if the child itself is the dynamic segment) changes. If you want an enter-animation to replay on a specific navigation, the `template.tsx` needs to live at (or below) the segment level where the param actually changes — check Fact #7 (route-group scoping) or push the template down into the folder whose child param is changing.
5. **Don't add `unstable_instant` speculatively.** It's a no-op / throws-in-client-components / only-meaningful-with-`cacheComponents` API (Fact #9). Not relevant until/unless this repo turns Cache Components on.
6. **A `loading.tsx` fallback is prefetched and cached client-side for ~30s by default** (`staleTimes`), separately from the rest of a dynamic route (Fact #6) — so a skeleton that goes stale-looking (e.g. shows a count that's since changed) is a design question, not a bug, within that window.
7. **To scope a `loading.tsx` to one route without affecting its siblings**, use a dedicated route group folder (Fact #7) rather than relying on file placement alone once nesting gets more complex than the current one-level `clientes/[id]` case.
