# Candidato D — Camaleón

## Intent (3 líneas)

The fold IS the demo: a phone running the client app re-skins itself live — Casa Prana (yoga, sage/cream) → Kaizen BJJ (near-black/red) → Studio Marea (dance, coral/warm) — every 2.8s.
Logo dot, business name, palette, class list, halo glow behind the phone and the H1 niche word all swap in sync, so the differentiator ("iBookit wears YOUR brand") is felt before a word is read.
The page's own skin stays fixed (canvas/ink/plum, Hanken Grotesk); only the world inside the phone changes — that contrast is the pitch.

## What to look at when judging

- The first 3 seconds: word, phone screen, halo and dot flip together at ~2.8s. The Kaizen swap (light → near-black) is the money moment.
- Believability of the booking screen: day pills, live spots ("Quedan 4" / "Lleno"), one reserved slot per brand, identical layout across all three (same app, different clothes).
- Dots under the phone are clickable (manual brand switch, pauses/restarts the cycle); hovering the phone pauses it.
- `prefers-reduced-motion`: no cycle, frozen on Casa Prana, static niche word; dots still switch instantly.
- Caption "Demo — tres negocios ficticios, un mismo iBookit." keeps the demo honest (zero invented proof).

## Measurements (headless Chrome, verified)

| check | result |
|---|---|
| Fold 1280×800 | CTA bottom 590px, micro-line 624px, full phone + dots 688px — entire pitch AND demo inside the fold |
| Fold 375×667 | CTA bottom 372px, micro-line 406px, phone top 442px (~225px of phone visible in fold) |
| Page height @1280 | 1943px = **2.43 viewports** (budget ≤2.5) |
| Horizontal overflow | none at 320 / 768 / 1440 / 1920 (`scrollWidth == clientWidth`) |
| Cycle | prana → kaizen → marea, giro/halo/dot synced, verified at t0/t+3s/t+6s |
| Reduced motion | frozen on prana after 6s, giro static (emulated media feature) |
| Truncation audit | 0 ellipsized lines inside any phone screen |
| CTA | `WHATSAPP=""` → `mailto:hola@ibooki.lat?subject=Quiero saber más de iBookit`; set the const to get `wa.me` + prefilled "Hola, quiero saber más de iBookit para mi negocio." |

## Implementation

One self-contained file; only external = Google Fonts (Hanken Grotesk). Three hand-built screens stacked absolutely inside the phone, crossfaded by class toggle (0.65s opacity); halos are three stacked radial gradients crossfading at 1.1s; a single `setInterval(2800)` drives screens + halos + dots + H1 word (WAAPI fade on the word). H1 height is reserved with an invisible sizer span (longest niche) so the CTA never jumps between brands. SR users get a static "La recepción de tu negocio, en orden." via `aria-label`; the phone is `role="img"` with a describing label.

## Open items

- Demo class rosters/coaches are invented fiction by design; swap freely if any name grates.
- `?rm=1` query param forces the reduced-motion JS path (test hook only, harmless in prod).
- OG image not included (no asset exists yet); og:title/description/locale/url are set.
