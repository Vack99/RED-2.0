# iBookit Brand Plan

The *how* for building the platform's own brand. The *what* is `PRODUCT-BRIEF.md` — read it
first; nothing from it is restated here. Supersedes the Opus handoff draft
(`Downloads/BRAND_HANDOFF.md`). Scope ends at the brand system: marketing-site build and app
theming are separate later work (marketing site first).

## Phases

| Phase | Output | Gate |
|---|---|---|
| A — Inventory | §A below | 🛑 CP1 |
| B — Strategy | `01-strategy.md` | 🛑 CP2 |
| C — Identity direction | `02-identity-direction.md` | — |
| C2 — Visual execution | `03-visual-identity/` (wordmark, mark, app icon, OG) | 🛑 CP3 |
| D — Fable prompt | `04-fable-prompt.md` | — |

All outputs live in `docs/brand/`. Each stands alone.

## Rules

1. **Derive, never invent.** Claims trace to the repo or PRODUCT-BRIEF; gaps get
   `[NEEDS CONFIRMATION]`, never a plausible guess.
2. **No UX/UI commentary.** The app is read only to learn what it is.
3. **es-MX first.** Voice principles, copy examples and the marketing site are Spanish-first.
   The wordmark must survive phonetic Spanish pronunciation (brief §7).
4. **Vertical-neutral.** No gym iconography anywhere (brief §2).
5. **One system, two expressions.** (a) iBookit corporate — marketing site, docs, platform
   emails. (b) House theme — the `base` brand module brandless businesses wear (brief §4.1).
   Shared DNA, but the house theme stays restrained and vertical-neutral: an unconfigured
   tenant must read as deliberate, never vendor-colored (the Shopify Polaris-vs-Dawn split).
6. **No hex in Layers 1–2.** Colour/type intent only; execution starts at C2.
7. **WCAG AA minimum** everywhere; AAA for body text on the marketing site.
8. **Stop at every checkpoint.**

## A — Inventory (DONE 2026-08-10)

Product, audience, vocabulary, do-not-claim: `PRODUCT-BRIEF.md`, verified against code.
Market: `docs/Context/2026-08-08-membership-booking-market-taxonomy.md`.

What a brand must supply (`packages/brand`):

- **33 token keys** × light+dark (`src/tokens.ts`): canvas, surface, sunk, line, line-soft,
  yellow, gold, yellow-dim, yellow-soft, yellow-edge, press-yellow, yellow-fg, yellow-core,
  silver, silver-dim, silver-core, fg, muted, muted-soft, green, red, warning, green-soft,
  red-soft, warning-soft, wa-bubble, wa-bubble-fg, wa-bubble-meta, ink, glass, scrim, tab-bg,
  backdrop. The accent role is keyed `yellow`/`gold` for historical reasons — map to it,
  don't rename it.
- **BrandModule slots** (`src/registry.ts`): `copy {name, description, tagline?}`, `logo`
  (React component), `appIcon` (flat SVG string — renders with no stylesheet),
  `loginAnimation?`, `defaultScheme`.
- **Out-of-contract surfaces**: receipt-email palette `{paper, ink, label, badge}`
  (`apps/admin/src/app/(app)/vender/_components/ticket-twin.ts` — Gmail strips CSS vars),
  brand-scoped CSS subpaths (`red/neon.css`, `red/recibo.css`).
- **Consumption**: Tailwind v4 CSS-first (`@theme inline`), tokens SSR-injected as CSS custom
  properties. No `tailwind.config` exists — never ask a tool for a "Tailwind theme extension".

Decisions recorded (reversible at CP1):

- Platform brand is invisible to end members; its audience is owner-operators. Matches shipped
  behavior (neutral email fallback, no powered-by).
- `base` module = the house identity of brief §4.1, evolved under rule 5 — not replaced by
  corporate colours.

CP1 rulings (owner, 2026-08-10):

- No named reference brands, no committed assets — clean slate; only the locked name + domain
  constrain the identity.
- Register: **minimal, modern, clean, warm** — and above all **recessive**: the brand must
  never get in the way of a client's business. A brandless client buys "just a package", and
  that staying-out-of-the-way is itself the differentiator to build Phase B around.
- Avoid: flashy, big-image, high-impact identity of any kind.

## B — Strategy

Web research on direct competitors (Mindbody, Glofox, TeamUp, Momence, Fitco, …): positioning
language + visual register + the gap. The taxonomy doc is input — market research is done,
don't redo it.

`01-strategy.md`: positioning statement (for/who/category/differentiator/unlike), category
decision + trade-off, primary audience, buyer, 3 ranked value props defensible from the brief,
the honest alternative, 3–5 adjectives each with an anti-adjective, competitor table, 3 voice
principles with es-MX do/don't examples.

## C — Identity direction

`02-identity-direction.md`: visual-register axes (technical↔approachable, dense↔airy,
warm↔cool, serious↔playful) justified from strategy; colour intent incl. semantic states + the
corporate/house split; type intent (display/body/mono, web-embeddable, variable preferred,
full es-MX diacritics); iconography + imagery direction; 3–5 reference brands with what to
take from each; anti-patterns.

## C2 — Visual execution (DONE 2026-08-11 · CP3 PASSED)

Wordmark + mark, app icon, favicon set (16/32/180/192/512), OG template, final palette + type
— chosen together, tested at favicon size and on dark. Must fill every BrandModule slot.
Tools: brandkit skill / image generation; escalate to a human designer if output misses the
bar.

CP3 rulings (owner, 2026-08-11): mark = **"El lugar"** (3×3 cell grid, one filled cell =
tu lugar apartado) · accent = **ciruela/plum** `#8A4A6C`/`#C287A8` · type = **Hanken
Grotesk** · concept B ("Apartado") and the integrated "B(i)ookit" wordmark REJECTED — the
latter renames the product; noted, do not revive. Canonical assets:
`03-visual-identity/final/` + `03-visual-identity/IDENTITY.md`. Favicon PNG exports are a
build step of the consuming app (SVG is source of truth).

## D — Fable prompt

`04-fable-prompt.md` — self-contained, assumes no repo access. Includes the C2 assets as
givens. Requests primitive→semantic tokens (two-tier; no component tier) as CSS custom
properties, two targets:

- (a) marketing site — greenfield semantic roles;
- (b) house theme — the exact 33-key contract, light+dark, from §A.

Constraints restated: es-MX, AA (AAA body on marketing), vertical-neutral, semantic states
without collision. Do-not: UI mockups, screen layouts, component designs, new logo marks,
invented claims, colours failing stated contrast.
