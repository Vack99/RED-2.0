# Loading screens — worktree kickoff (territory notes)

**Date:** 2026-07-22
**Worktree:** `.claude/worktrees/loading-screens` — branch `worktree-loading-screens`, based on `main` @ `a4f7803`
**Baseline:** `pnpm test` green — 84 files / 1045 tests, 0 failures
**Next session pipeline:** `/wayfinder` → `/to-spec` → `/to-tickets`

This file is **territory, not design.** It records what is on the ground so wayfinder
can chart the route. It deliberately does not decide what the loading screens should
look like or which routes get one — that is wayfinder's job.

---

## The ask (owner, verbatim scope)

> find all missing loading screens and implement them

Named priority surfaces: **page loading, member page, dashboard page, agenda page, cuenta page.**

Two of those names are ambiguous against the actual route tree — see Open questions.

---

## Ground truth: what exists today

### One loading fallback in the entire monorepo

```
apps/admin/src/app/(app)/clientes/[id]/loading.tsx   ← the only one
```

**Zero `<Suspense>` boundaries anywhere** in `apps/` or `packages/` (grep, 0 hits).
So today: every route except the client ficha shows the *previous* screen frozen
until the server component's data fan-out resolves, then swaps.

### The primitive is already built and unused

`packages/ui/src/forge/skeleton.tsx` exports `Skeleton` + `skeletonStyle`:

- Pure/presentational, no hooks → renders on the server, drops straight into `loading.tsx`
- Shimmer rides the existing `forge-flash` keyframe; the global reduced-motion block
  neutralizes it to a clean static block
- `aria-hidden` (carries no information)
- Variants: `circle` (avatar), `text` (line), explicit `width`/`height`/`radius`
- Brand-neutral — colours are `var(--*)` tokens, so RED renders RED and Forge renders Forge
  with no per-brand code
- Has its own unit test (`skeleton.test.ts`)

**Implication for wayfinder: this is a coverage problem, not an invention problem.**
The primitive and the precedent both exist; ~1 route uses them.

### The established pattern (the one precedent)

`clientes/[id]/loading.tsx` sets the bar, and its header comment states the doctrine:

1. It renders **inside `template.tsx`**, so the `forge-enter` 260ms slide plays on the
   *skeleton* the instant the row is tapped — the transition couples to the gesture
   instead of waiting on the data fan-out.
2. It **mirrors the real component's layout** (same AppBar shell, identity header, gauge
   card, action row, history rows) at **matching paddings**, so the swap to real content
   is not a layout jump.

Point 2 is the expensive part and the quality bar: a skeleton that doesn't match its
screen's geometry trades a freeze for a jump.

### `apps/admin/src/app/(app)/template.tsx`

Client component, re-mounts on every navigation, wraps children in the `forge-enter`
animation. Any `loading.tsx` under `(app)/` inherits this for free — that is *why* the
precedent works.

---

## Data-fetch weight per route (why each screen stalls)

Measured by reading each `page.tsx`. "Serial head" = an `await` that must resolve
*before* the parallel batch starts.

| Route | Serial head | Parallel batch | Total reads | `loading.tsx`? |
|---|---|---|---|---|
| `(app)/cuenta` | `getOperatorGym` | **14** | **15** | ✗ |
| `(app)/clientes/[id]` | — | ~7 fan-out | ~7 | ✓ **only one** |
| `(app)/inicio` (dashboard) | `getOperatorGym` | 4 | 5 | ✗ |
| `(app)/agenda` | `getOperatorGym` | 3 | 4 | ✗ |
| `(app)/clientes` (roster) | — | 1 (+searchParams) | 1 | ✗ |
| `(app)/asistencia` | not yet read | — | — | ✗ |
| `(app)/vender` | not yet read | — | — | ✗ |
| client `/reservar` | `getClaims` → `getEsMiembro` (→ maybe `reclamarCliente`) | 3 | 5–6 | ✗ |
| client `/clase/[sessionId]` | not yet read | — | — | ✗ |
| client `/precios`, `/nosotros`, `/contacto`, `/legal` | not yet read | — | — | ✗ |

`cuenta` is the standout: **14 parallel reads behind a serial `getOperatorGym`**, and it
is one of the named priority surfaces. `/reservar` has the longest *serial* chain
(auth → membership check → possible claim → batch), so it stalls on round-trips, not fan-out.

**Observation, not a finding:** every admin page awaits `getOperatorGym()` before its
`Promise.all`, which is a serial waterfall. Perf work already shipped separately
(see the `perf-50ms-loop` memory); flagging only because loading screens *mask* latency
while a waterfall fix *removes* it, and wayfinder may want to decide whether those are
one route or two.

---

## Open questions for wayfinder

These are the ambiguities I refused to resolve by guessing:

1. **"member page" — which one?** Candidates:
   - `apps/admin/(app)/clientes/[id]` — the member ficha, but this is the one route that
     **already has** a loading screen
   - `apps/admin/(app)/clientes` — the roster list
   - `apps/client/reservar` — the member's own booking home in the client app

   Given the ficha is already covered, the owner most likely means the roster or the
   client-app member home. Needs one question.

2. **"page loading" — what shape?** Could be (a) a root-level `loading.tsx` per app as a
   generic catch-all, (b) the `app/page.tsx` route specifically, or (c) a global
   navigation-progress affordance. Very different builds.

3. **Scope boundary:** named surfaces only, or all-routes coverage? The table above shows
   ~12+ uncovered routes across both apps. "Find *all* missing loading screens" reads as
   the latter, but the named list reads as the former.

4. **Client app has no `template.tsx`** — so the precedent's "animation plays on the
   skeleton" trick does not transfer to `apps/client` for free. Does the client app get
   one, or do its loading screens go without the enter animation?

5. **`loading.tsx` vs `<Suspense>`:** route-level fallback replaces the *whole* screen;
   granular Suspense can stream a static shell with only the data regions skeletonized
   (e.g. `cuenta`'s 14 reads don't all feed the same panel). The precedent uses
   route-level. Per-route decision or one blanket rule?

6. **Static/public client pages** (`/legal`, `/nosotros`, `/precios`) may be near-instant
   and need nothing. Confirm before spending tickets on them.

---

## Workspace state

- ✅ Worktree created, fast-forwarded to local `main` @ `a4f7803` (incl. the unpushed
  hitl-88 docs commit)
- ✅ `pnpm install` clean (pnpm 11.5.1, husky hooks prepared)
- ✅ `pnpm test` green — 84 files / 1045 tests
- ✅ Working tree clean apart from this doc
- ⚠️ Pre-commit hook runs `pnpm lint && pnpm typecheck && pnpm test` — budget for it
- ⚠️ No migrations expected for this work → `pnpm test:denial` should not be in scope

**Next session, start here:** `/wayfinder` with this file as the territory brief.
