# apps/client loading-screen recon — shell, animation, tokens, screen scaffolds

Recon only, no code changed. Scope: what a `loading.tsx` in `apps/client` can look
like, and what (if anything) needs wiring before one can be authored.

## Shell & animation ground truth

**File inventory** (`apps/client/src/app`): exactly one `layout.tsx` (root, no
nested layouts anywhere under `app/`), **zero** `template.tsx`, **zero**
`loading.tsx`. Confirmed by a recursive glob — nothing hides in a route group.

**Persistent shell**: the root `layout.tsx` renders `<PublicHeader>` as a
sibling of `{children}` inside `<body>`, so it survives every navigation (the
root layout never remounts). `PublicHeader` (`app/_components/public-header.tsx`)
is a thin, transparent, non-fixed top bar (hamburger → left-slide nav drawer,
"Entrar"/"Mi cuenta" link) — **not** a bottom tab bar like admin's `TabBar`.
It self-hides via a client-side pathname check (`usePathname`) on exactly three
routes: `/entrar`, `/registro`, `/restablecer` (the full-viewport auth-hero
screens). It renders normally on `/reservar`, `/clase/[sessionId]`, `/precios`,
etc. — so those screens sit *under* the header, and each screen additionally
owns its own in-page header/hero (e.g. reservar's "Esta semana" title + avatar
button) — the two are stacked, not duplicated chrome.

**Page-transition animation: none at the routing level.** There is no
`template.tsx` in `apps/client`, so nothing remounts/re-animates content on
navigation the way admin does. The `forge-enter` keyframe (see below) is
already loaded into client's CSS via `@import "@gym/ui/motion.css"` in
`globals.css`, but a repo-wide grep for `forge-enter`/`forge-pop`/`forge-spin`/
`forge-rise` inside `apps/client` returns **zero matches** — the keyframe is
present but entirely unused there today.

What client *does* have is bespoke, per-screen, element-scoped reveal
animation authored directly in `globals.css` (not a generic route mechanism):
- `riseIn` — the marketing landing page's staggered hero→CTA→schedule→footer
  cascade (`.cm-hero .btn-primary`, `.cm-srow`, `.cm-foot`, …), 1.5s–2.4s delays.
- `rvcDraw`/`rvcGlow`/`rvcBurst` — the reservar booking-confirmation ring-draw
  + confetti morph (`.rvc-*`), fired on the confirmed sheet.
- `cfpop` — the confirmada screen's outline-check pop-in (`.cf-check`).
- `pipFlick`/`pipBreathe` — the clase-detail roster pips' neon flicker-on and
  the reservar occupancy bar's ember breathe (`.rcard-pips`, `.cd-roster .pips`),
  RED-dark only (`.dark[data-brand="red"]` scoped; Forge/base paint calm static
  bars/pips with no animation).

All of the above are colorless/token-driven where they touch color, and all
respect the single shared `prefers-reduced-motion` block in `motion.css`
(durations/delays zeroed to 0.01ms, one iteration).

**Font setup**: root layout self-hosts two variable Google fonts via
`next/font/google` — Outfit (`--font-outfit`, UI text) and JetBrains Mono
(`--font-jetbrains-mono`, data/badges/eyebrows) — exposed as CSS vars on
`<html>` and mapped in `globals.css`'s `@theme inline` to `--font-sans`/
`--font-mono`. `html, body` also hard-sets `font-family: var(--font-outfit), …`
directly. No brand import in the layout for fonts — same setup shape as admin.

## Skeleton readiness verdict

**`packages/ui/src/forge/skeleton.tsx`** is a pure/presentational box
(`aria-hidden`, no hooks, SSR-safe) using exactly two CSS custom properties:
- `var(--sunk)` — the placeholder's fill color.
- `var(--fg)` — via `color-mix(in srgb, var(--fg) 7%, transparent)` in the
  sweeping shimmer highlight bar.
- The shimmer itself animates via the `forge-flash` keyframe (defined once in
  `packages/ui/src/motion.css`, the same file that defines `forge-enter`).

**Token wiring**: both `sunk` and `fg` are members of the 33-key brand
contract (`packages/brand/src/tokens.ts` → `TOKEN_KEYS`), filled by every
brand (`red`, `forge`, `base`) for both light and dark schemes
(`packages/brand/src/{red,forge,base}/tokens.ts`). The root layout SSR-injects
the per-request `:root/.light`/`.dark` token block via `brandCss(brand, …)`
into `<head>` (ADR-0012 §3 — the sole definer, no separate `:root` in
`globals.css`), and `globals.css`'s `@theme inline` maps `--color-sunk:
var(--sunk)` and exposes `--fg`/`text-fg` directly — both already wired and
already in heavy use across client (`bg-sunk`/`text-fg` show up in
reservar, clase-detalle, contacto, precios, public-header, …). `forge-flash`
reaches client the same way `forge-enter` does: `globals.css` already
`@import`s `@gym/ui/motion.css`.

**Import path**: `@gym/ui`'s `package.json` exports map exposes
`"./forge/skeleton": "./src/forge/skeleton.tsx"`, exactly the path admin
already imports (`import { Skeleton } from "@gym/ui/forge/skeleton"` in
`apps/admin/src/app/(app)/clientes/[id]/loading.tsx` — see below).

**One gap, not a blocker**: a repo-wide grep shows `apps/client` currently
imports **zero** components from `@gym/ui`, anywhere — not `Skeleton`, and
notably not the `AppBar`/`Card`/`Eyebrow` primitives admin's loading.tsx reuses
for its shell chrome (`@gym/ui/forge/ui`). Client's screens are hand-rolled
Tailwind/inline-style JSX (see scaffolds below), with no shared primitive
library of their own either (`app/_components/` holds only 4 one-off
components: `auth-shell`, `cta-ver-planes`, `pricing-teaser`,
`public-header`). So a client `loading.tsx` gets `Skeleton` for free but must
hand-build its shell markup to match each screen's actual classNames/paddings
— there's no `AppBar`/`Card` shortcut to lean on the way admin's does.

**Verdict: `Skeleton` can drop into `apps/client` today with zero wiring.**
Both CSS vars it reads (`--sunk`, `--fg`) and its animation keyframe
(`forge-flash`) are already live in client's per-request CSS for both brands,
light and dark. The only "gap" is that no client screen has ever imported it
yet — that's authoring work, not plumbing work.

## Screen scaffolds

### `/reservar` — member booking home
`apps/client/src/app/reservar/page.tsx` (server, auth-gated) →
`_components/reservar-semana.tsx` (`ReservarSemana`, client island). Root:
`<main class="mx-auto w-full max-w-md px-4 pb-10">`.

1. **Header** (`px-2 pt-6`, flex justify-between) — static eyebrow "Reservar
   clase" (10px caps) + `<h1>` "Esta semana" (3xl extrabold) on the left;
   40×40 circular profile-initials button on the right. *Eyebrow/H1 = static
   copy; avatar initials = data (member's name).*
2. **Day picker** (`mt-5`, flex row, 7 flex-1 columns) — weekday abbrev (9px) +
   day number (2xl tabular) + a 3px active-indicator underline per day.
   *Fully data-driven (the week's 6–7 day cells, `esHoy`/selected state).*
3. **Divider** — 1px hairline (`bg-line`), `mx-2 mt-3`.
4. **Class list** (`mt-4`, flex-col gap-3, `px-1`) — one **ticket card** per
   session (`.ticket` class: flush card, perforated divider, 2 punched
   notches), each card = `flex` row of:
   - Left content (`p-4`, flex-1): class type name (lg bold) + optional heart
     icon, coach names + duration (11px caps muted), optional "Tu favorita"
     pill, right-aligned unit label + big number (occupancy count or similar),
     then a full-width ember occupancy bar underneath.
   - Right stub (`w-[104px]`, `bg-sunk`, flex-col centered, `px-2.5 py-4`):
     time (lg tabular bold) + a state pill (reservable/reservada/full/finished,
     4 visual states).
   Empty-day fallback: centered text block (`px-6 py-12`), bold title + muted
   subtext, both static copy.
   *All session data (name, coaches, time, occupancy %, CTA state) is
   data-driven; only the empty-state copy is static.*
5. **Footer** (`mt-6 px-2 text-center`) — one static line of muted 11px copy
   ("Cancela sin costo hasta 2h antes…").
6. **Bottom sheet** (summary/confirmed) and the **Perfil overlay** are
   interaction-triggered (`sheet`/`perfilOpen` state, both `null`/`false` on
   first paint) — not part of the initial route-load skeleton; a
   `loading.tsx` never needs to scaffold them.

### `/clase/[sessionId]` — class detail
`apps/client/src/app/clase/[sessionId]/page.tsx` (server, auth-gated,
`notFound()` if RLS can't see the session) → `_components/clase-detalle.tsx`
(`ClaseDetalle`, client island). Root: `<main class="mx-auto flex min-h-dvh
w-full max-w-md flex-col bg-canvas">`, a flex column with a scrollable middle
and pinned header/footer.

1. **Header** (`flex-none px-5 pb-2 pt-4`, flex justify-between) — "← Horario"
   back link (muted, static label) + a right-aligned "contexto" tag (11px caps,
   e.g. day label). *Back link static; contexto tag data-driven.*
2. **Scroll body** (`flex-1 overflow-y-auto`), sections stacked, each new
   section after the hero gets `border-t border-line`:
   - **Hero** (`border-b border-line px-6 pb-6 pt-3`): type pill + status
     badge (flex justify-between) → `<h1>` class type (4xl extrabold, all
     caps) → duration/sala line (11px caps muted) → date/time line (xs muted)
     → favorite toggle button (icon + label, mt-4). *All data-driven.*
   - **Datos** (`px-6 py-4`): "Datos" section label (10px caps eyebrow,
     static) + 5 `FactRow`s (label/value pairs, hairline between rows): Hora,
     Duración, Sala, Nivel, Cupo. *Label text static; values data.*
   - **Coaches** (`px-6 py-4`, conditional on data) — section label + N coach
     cards (36px circle avatar-initials + name + specialty + optional bio,
     hairline between). *Fully data-driven, section itself may be absent.*
   - **La sesión** (`px-6 py-4`, conditional) — section label + one paragraph
     of description copy. *Data-driven, may be absent.*
   - **Qué trabajamos** (`px-6 py-4`, conditional) — section label + N rows of
     `label (62px mono) : value` pairs. *Data-driven, may be absent.*
   - **Qué traer** (`px-6 py-4`, conditional) — section label + numbered pill
     list. *Data-driven, may be absent.*
   - **Cupo roster** (`border-t`, `.cd-roster px-6 py-4`) — section label +
     a row of thin occupancy "pips" (one per seat capacity) + a status line
     (e.g. "N de M lugares tomados") + up to 4 avatar-initial circles (30px)
     with a "+N" overflow chip. *Fully data-driven.*
3. **CTA footer** (`flex-none border-t border-line bg-canvas px-6 pb-8 pt-4`)
   — one line of conditional helper copy + one full-width action button (5
   mutually-exclusive states: book / cancel / expired-membership CTA / full /
   depleted-plan CTA). *State/copy is entirely data-driven (session status +
   member's saldo).*
4. **Cancel-confirm sheet** — interaction-triggered (`confirmCancel` state,
   `false` on load) — skip in the loading skeleton.

### `/cuenta`
**Does not exist in `apps/client`.** A repo-wide search under
`apps/client/src/app` for `cuenta`/`membres*`/`mis-reservas` finds no route —
only `reservar/_components/sin-membresia.tsx` (a no-membership empty state
rendered *inside* `/reservar`) and the `PerfilOverlay` sheet (profile/plans,
reached from `/reservar`'s avatar button, not its own route). Whatever "my
account"-shaped screen the loading-screen work expects will need to target
`/reservar`'s `PerfilOverlay` sheet content or a genuinely new route — there is
no existing `/cuenta` page/loading pair to mirror the way `/reservar` and
`/clase/[sessionId]` can mirror admin's `clientes/[id]`.

### `/precios` — representative static page
`apps/client/src/app/precios/page.tsx` (server, no auth gate). Root:
`<main class="mx-auto w-full max-w-5xl px-5 py-10">`.

1. **Header** (`mx-auto max-w-2xl text-center`): optional gym-branded eyebrow
   ("Precios · {gym.brandName}", data) → `<h1>` "Planes" (4xl, **static
   copy**) → intro paragraph (**static copy**) → optional tagline line
   (data-driven, gym values).
2. **Plans grid** (`mt-10 grid gap-5 md:grid-cols-3`) — N `PlanCard`s (or one
   centered "coming soon" static line if empty): each card = optional badge
   pill, plan name (xl bold), optional subtitle, price line (3xl extrabold +
   cadence), a feature checklist (`ul`, check icon + text per feature), a CTA
   link (styled per `popular`), optional footnote. *Entirely data-driven
   except the check-icon glyph and card layout itself.*
3. **"Todos los planes incluyen"** (`mt-12 max-w-2xl rounded-3xl border
   bg-surface p-6`) — static section label + a `dl` of up to 5 label/value
   rows; 2 of the 5 (coaches count, horario) are data-driven and conditionally
   present, the other 3 ("Equipo y material", "Reserva digital",
   "Permanencia") are **hardcoded static rows**, always present.
4. **FAQ accordion** (`mt-12 max-w-2xl`, conditional on data) — static
   section label + `FaqAccordion` (client component, data-driven Q&A list).
5. **"Empieza hoy" closer** (`mt-12 max-w-2xl rounded-3xl border bg-sunk
   p-8 text-center`) — heading, paragraph, 2 CTA links, fine-print line: **all
   static copy**, no data at all.

*Overall: `/precios` is the clearest static-vs-data split of the four — the
scaffolding (headings, section labels, CTA closer, the 3 hardcoded "incluye"
rows) is copy that can render as-is in a loading state; only the plan cards,
coach/horario counts, tagline, and FAQ list need skeletonizing.*

## Animation parity: what client would need

Admin's trick, read from `apps/admin/src/app/(app)/template.tsx` (11 lines):
the `(app)` layout renders `<TabBar>` **outside** `<main>{children}</main>`
(persistent, never remounts), and a sibling `template.tsx` wraps `{children}`
in a `<div style={{ animation: "forge-enter 260ms cubic-bezier(.32,.72,0,1)
both" }}>`. Next re-mounts `template.tsx`'s subtree on every navigation
(unlike `layout.tsx`), so the animation replays every time — including the
instant a `loading.tsx` fallback mounts, which is exactly what makes
`apps/admin/src/app/(app)/clientes/[id]/loading.tsx`'s docstring true: *"the
`forge-enter` slide plays on THIS skeleton the instant the roster row is
tapped."* That file is a ready-made reference for the pattern this task is
prepping for — it already composes `Skeleton` + shared primitives into a
loading shell that mirrors its real screen's layout at matching paddings.

For `apps/client` to get the same trick:
1. **Add a `template.tsx`** — there is no `(app)`-style route group in client
   (routes hang directly off `app/`), so it would sit beside the root
   `layout.tsx` at `apps/client/src/app/template.tsx`, wrapping `{children}`
   the same way. Because `PublicHeader` already lives in `layout.tsx` as a
   sibling of `{children}` (not inside it), it already satisfies the
   "persistent shell outside the animated subtree" precondition — no shell
   refactor needed first.
2. **Keyframe**: `forge-enter` is the one to reuse — it's already imported
   into client's CSS via `globals.css`'s `@import "@gym/ui/motion.css"` (the
   same import that carries `forge-flash` for `Skeleton`). **No new CSS is
   required** — client's `globals.css` needs no edits at all for this; the
   keyframe is present and idle, just unreferenced by any element today.
3. **Scope decision** (not yet made, flagged for whoever authors this): a
   client-wide `template.tsx` would re-play `forge-enter` on *every*
   navigation, including the three header-hidden auth routes and the
   marketing pages that already run their own `riseIn` cascade — worth
   deciding whether those should opt out (e.g. skip the wrapper via a
   pathname check mirroring `RUTAS_SIN_HEADER`, or accept the double-motion)
   before wiring it in.
