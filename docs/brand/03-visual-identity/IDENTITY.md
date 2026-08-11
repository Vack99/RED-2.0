# iBookit — Visual Identity (C2, locked at CP3 · 2026-08-11)

Owner rulings: mark = **El lugar** · accent = **ciruela/plum** · type = **Hanken Grotesk**.
Canonical assets: `final/` (mark, lockup light/dark, app icon, OG template). Candidate
history stays under `candidates/` — never ship from there.

## The mark

A quiet 3×3 grid of outlined cells — the week's schedule — with one filled plum cell: **tu
lugar apartado**. The filled cell sits off-center (row 2, col 3) and is the only cell with a
squared top-left corner; that corner + the off-axis fill are the signature. Construction:
64u grid, 20u pitch, 12u cells (rx 3), 2.5u stroke, 13u accent cell. At 16px it degrades to
a soft grid — always pair with the wordmark below 20px.

## Palette

| Role | Light | Dark |
|---|---|---|
| lienzo / canvas | `#FAF8F4` | `#16130E` |
| superficie / surface | `#FFFFFF` | `#1E1A14` |
| tinta / ink (text) | `#201B14` | `#F2EDE5` |
| tenue / muted | `#6B6257` | `#A79B8C` |
| **acento — ciruela** | `#8A4A6C` | `#C287A8` |

Accent is scarce by rule: actions, focus, the claimed cell — never body text, never floods.
Contrast (measured): plum on canvas 6.0:1; keep AA everywhere, AAA body on marketing.
Semantic states (success/error/warning) stay green/red/amber — plum never collides with them.

## Type

**Hanken Grotesk** (variable, OFL, Google Fonts). Display/wordmark 600, body 400, tabular
numerals (`font-variant-numeric: tabular-nums`) for prices, vigencias, receipts. Wordmark:
"iBookit" — 600, letter-spacing −0.02em, the i/B seam always legible (never "ibookit").

## Asset notes

- `appicon.svg` — self-contained flat SVG (no text, no external refs); favicon/app-icon
  source. PNG exports (16/32/180/192/512) are a build step of whichever app ships them.
- `lockup-*.svg` and `og-template.svg` use live `<text>` — render only where Hanken Grotesk
  is loaded, or outline to paths for print/handoff.
- The mark recolors by swapping the accent fill only; quiet cells always take the scheme's
  ink color.
