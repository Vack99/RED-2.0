# Marketing-page kickoff — HANDOFF (2026-08-11)

Session protocol: /caveman /ponytail /keep-it-lean · orchestration session (sonnet research /
opus visual agents, foreground; taste deliverables in the main session).

## Where we are

**Brand structure A→D is COMPLETE** (`docs/brand/BRAND-PLAN.md` — all checkpoints walked).
Everything is on `main` through `03cbeb1`+, **unpushed** (push = owner-gated; nothing here is
prod-serving anyway).

Locked identity (CP3, owner):

- Mark **"El lugar"** — 3×3 outlined-cell grid, one filled cell = tu lugar apartado.
- Accent **ciruela/plum** `#8A4A6C` / `#C287A8` · warm neutrals · **Hanken Grotesk** 600/400,
  tabular numerals.
- Canonical assets: `docs/brand/03-visual-identity/final/` (mark, lockups, app icon, OG
  template) · spec: `docs/brand/03-visual-identity/IDENTITY.md`. Ship ONLY from `final/`.
- **Alternate on file, NOT in use:** índigo cálido `#5560A8`/`#98A2E0` — full asset set in
  `candidates/a-el-lugar/refine/`, documented in IDENTITY.md §Alternate. Only the owner
  reopens it; if ever adopted it's a pure accent swap, nothing else moves.
- Rejected, do not revive: concept B "Apartado", integrated "B(i)ookit" wordmark.

## Next: build the marketing/commercial page

Owner-stated order: marketing page FIRST; own-brand admin/client frontends LAST.

Inputs, all ready:

1. **Tokens:** run `docs/brand/04-fable-prompt.md` (self-contained; Target A = marketing
   semantic tokens — Target B is the app house theme, not needed for this build).
2. **Copy rules:** `docs/brand/01-strategy.md` — positioning, 3 ranked value props (brand /
   roster-day-one / four-questions), voice (tú, mostrador language, promise-only-what-ships;
   do-not-claim list in `PRODUCT-BRIEF.md` §6 binds marketing). es-MX first.
3. **Audience/niches:** brief §2 + `docs/Context/2026-08-10-sales-niche-sweep.md` (the
   three-businesses rule applies to every image/icon: piano school + climbing gym + dance
   academy must all self-recognize).

Open decisions for that session (none blocking start):

- Hosting/stack of the page (likely a third app or static site in the monorepo — decide
  lean; nothing exists yet, `apps/` has only admin+client).
- Domain: write for `ibooki.lat` (live infra still answers on `ibookit.lat` — never
  hard-code live URLs; see PRODUCT-BRIEF §7).
- Published MXN pricing is a strategy constraint (01-strategy §GTM) — owner must supply the
  actual price when the pricing section is built.

## Traps

- Boards (`03-visual-identity/board*.html`) are decision history, not shippable assets.
- Lockup/OG SVGs use live `<text>` — Hanken must be loaded wherever they render; outline to
  paths for anything that can't.
- Favicon PNG exports (16/32/180/192/512) are a build step of the page, from
  `final/appicon.svg`.
