# Concept E — Cartel

## Intent (3 lines)

The fold is a poster, not a webpage: one flat plum plane edge-to-edge, the H1 at ~95px filling the full width, and the white agenda panel breaking the block's bottom edge so the composition reads designed. A second, deeper plum plane (rounded corner echoing the mark's tile) anchors the bottom-right under the panel — two flat planes, zero gradients/shadow-glow (the panel's offset is a solid print-style block). Deliberately breaks "plum is scarce" to test whether committed color beats restraint in the first second.

## What to look at when judging

- First-second impact at 1280×800: does the plum plane + giant type hit before you read anything?
- The panel breaking the fold's bottom edge (64px at 1280, 48px at 375) — does it read as product, and does it invite the scroll?
- The rotating giro in light tint at poster scale — each word fits on one line at every width (JS fit, no reflow jump).
- The dark-plum closing block: moats + CTA as the poster's echo. Does the page feel like one system?
- Mobile 375: full pitch in the fold with the panel peeking at the bottom edge.

## Measurements (headless Chrome, real renders)

- 1280×800: pitch (H1+sub+CTA+micro) bottom = 626px, inside the fold; panel spans 565→852 vs fold bottom 788 (breaks edge by 64px); page height 2000px = 2.50 viewports exactly.
- 375×667: pitch bottom = 426px, inside the fold; panel 508→795 vs fold bottom 747 (breaks edge by 48px); page 2797px.
- Horizontal overflow: none at 320 / 375 / 768 / 1280 / 1440 / 1920 (scrollWidth ≤ viewport at all six).
- Contrast (computed): cream on plum 6.04; giro tint on plum 4.44 (display-size only — 94.7px/38px, large-text 3:1 bar); micro-line 5.02; CTA text on button 6.04; spots on card 6.31; muted on canvas 5.64; moat notes on dark plum 7.89; email link 11.72.
- Reduced motion: verified via matchMedia shim — giro stays static "negocio", no swap animation; CSS also kills all animation/transition.
- Rotation: verified cycling (estudio de yoga → academia de jiu-jitsu → box de CrossFit) at 2.6s; longest giro auto-shrinks (94.7px → fits at 1280; 38 → 33.3px at 375), one line always.

## Open items

- `WHATSAPP` const is empty → all CTAs resolve to mailto:hola@ibooki.lat with pre-filled subject (also hardcoded in markup as no-JS fallback). Set the number to flip every CTA to wa.me with the pre-filled message.
- No og:image (no hosted asset exists yet); og title/description/url/locale are in.
- Panel content (Funcional / Yoga flow / Jiu-jitsu / Box, "Hoy · martes") is illustrative UI, not copy — swap freely if a niche-neutral set is preferred.
