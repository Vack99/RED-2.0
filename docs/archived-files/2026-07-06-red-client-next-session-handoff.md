# RED client — next-session handoff (post-remediation)

**Date:** 2026-07-06 · **Branch:** `main @ 9693a21` (pushed, deployed, renders correctly).
Design remediation is SHIPPED. Full execution record: the `phase6-client-execution-progress`
memory + `docs/planning/2026-07-06-red-client-design-remediation.md` (+ `-red-brand-animation-cross-app.md`).
This doc = the three things left, and what you need to do them.

## Next session — 3 work streams

### 1. Slice 0 — Supabase Auth config — DO FIRST (owner-only, minutes)
Dashboard → project `hjppxawglmukfvsgmcog` → Authentication → URL Configuration:
- **Site URL** = `https://red-2-0-client.vercel.app`
- **Redirect URLs**: `https://red-2-0-client.vercel.app/**`, `https://forge-red-2-0-client.vercel.app/**`, `http://localhost:3000/**`

Until this lands, the confirm email redirects to `localhost/?code=` and the whole authed
journey (registro → confirm → entrar → reservar) can't be walked. Several "auth bugs" may
just be this — set it before triaging auth.

### 2. Client bugs (triage + fix) — *you're bringing the specifics*
List them at the bottom before we start. Repro setup is below. When triaging, first rule out
two non-bugs:
- **Empty/fallback content** on nosotros / precios (per-plan note) / clase ("Qué trabajamos") /
  confirmada (Estudio address) is BY DESIGN until the new columns are seeded (see setup) — not a bug.
- **Auth failures** before Slice 0 is set are expected — not a bug.

Then the genuinely-new surface most worth suspecting: the auth-hero recomposition
(`red/login-hero.tsx` + `auth-shell.tsx`, layout on small screens), the `?perfil=1` deep-link
(`reservar/page.tsx` → PerfilOverlay), the ember-bar occupancy segmentation + `.ignited` trigger
(`reservar-semana.tsx`), the roster pips (`clase-detalle.tsx`), and the `.ics` dedup
(`lib/ics.ts` + its 3 callers). Forge no-bleed was curl-verified at the token level; worth an
eyeball on real Forge screens.

### 3. Animation polish
Two homes: the **ring ignition** keyframes are local to `packages/brand/src/red/ring-mark.tsx`
(ringDraw arcs .15s/.6s → per-letter redFlick 1.18/1.46/1.72s → redBreathe idle 4.2s @ 2.4s ∞);
the **screen-level** ones are in `apps/client/src/app/globals.css` (neon copy `cm-*`, `riseIn`
cascade, ember `pipBreathe`/`mbSweep`/`mbBreathe`, roster `pipFlick`, `cfpop`, and the `rvc*`
booking morph). All use `forwards`/`both` so the global reduced-motion collapse
(`@gym/ui/motion.css`) lands them lit — keep that when tuning. Likely polish: landing choreography
(ring → neon-copy → riseIn hand-off timing), the ember `.ignited` sweep (applied statically →
fires on mount), and the auth-ring size (see accepted tradeoff below).

## Testing setup
- **Local RED:** `pnpm --filter @gym/client dev` → `http://localhost:3000/?gym=red` (dark). `?gym=`
  engages because localhost is unmapped; `red.localhost:3000` also resolves RED.
- **Prod:** `red-2-0-client.vercel.app` (RED) · append `?gym=red-demo` for the demo twin (works only
  on the prod host — resolveTenant is host-wins) · `forge-red-2-0-client.vercel.app` (Forge no-bleed check).
- **Mock (source of truth):** `C:\Users\Aaron\Desktop\Pending\Red-1.0 Client App Frontend Design\RED-1.0-Design\index.html`.
- **Seed** `gym.about_story`/`about_pull_quote`/`about_tagline`, `paquetes.nota`,
  `class_type_workblock.value` for red-demo, or those screens stay in their fallback state.
- Live migration `20260706220000` is already applied.

## Invariants — don't break, don't re-derive
- Screens are SHARED across brands and recolor via CSS-var tokens. **Never a literal color hex in
  screen markup** (Forge-bleeds). RED-neon literals live ONLY under `.dark` in globals.css, or inside
  RED-brand-only components (`red/*`). Tailwind token utils: `bg-canvas/surface/sunk`, `text-fg/muted`,
  `text-accent`, `text-warning`/`bg-warning-soft` (amber few/full/cancel), `text-ink` (near-black on amber).
- Dark is SSR-stamped by `layout.tsx` from `brand.defaultScheme`. Token contract = 30 keys
  (`packages/brand/src/tokens.ts`); glow/ember reds are brand-scoped, NOT contract keys.

## Accepted tradeoffs (decided — NOT bugs)
Single 140px auth ring (mock uses 200 entrar / 108 registro; per-screen sizing would need a
contract widening). · Registro back-nav at form bottom (mock has a top header). · "estudio funcional"
generic footer copy (per the hybrid-copy decision; a future data column).

## Pre-existing follow-up
Root `tsconfig` includes admin's `.next/types` but not client's → a stale admin build makes root
`tsc` globally augment `Route` to the admin union and false-flag client `<Link>`s. Fix = add
`apps/client/.next/types/**` to the include. Meanwhile: `rm -rf apps/*/.next` before committing.

## Bugs to cover

### Bug 1 — nested `<button>` on the Perfil overlay (hydration error)
**Symptom:** two console errors on `/reservar` → Perfil overlay → "Notificaciones" row —
`<button> cannot contain a nested <button>` and `<button> cannot be a descendant of <button>`
(the second is a hydration error).
**Root cause:** `Row` (`reservar/_components/perfil-overlay.tsx:204`) renders a `<button>` for any
row without an `href`. The Notificaciones row has no `href` **and** no `onClick` (it's a display-only
row) but passes `trailing={<Toggle>}`, and `Toggle` (`:154`) is itself a `<button role="switch">` →
button-inside-button.
**Fix:** make `Row` 3-way — `href` → `<Link>`, `onClick` → `<button>`, otherwise → a plain `<div>`
(non-interactive; the trailing control owns the click). Drop `type="button"` on the div branch.
Today only the Notificaciones row hits the else branch, so the change is isolated.

### Bug 2 — _(add)_

