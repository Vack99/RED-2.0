# Candidate B — "El mostrador" · design plan

Written BEFORE the markup. Direction: product-led, warm, human. The page shows the product
working through small honest HTML vignettes in the product's own UI language — never
screenshots, never a fake dashboard. Narrative spine: **one day at the mostrador** — the desk
opens (agenda), the questions of the day get answered (vignettes), the clients book
themselves, the whole thing wears your brand, we move you in, we're straight with you, talk
to us.

## Locked section count: 7

| # | id | Job | Composition anchor | Content |
|---|----|-----|--------------------|---------|
| 1 | `#inicio` | hook | **Split diptych** (headline left / agenda vignette right) — the ONE left-text/right-image on the page | H1 + sub + primary CTA + secondary typographic link. Vignette V1. |
| 2 | `#mostrador` | prove / show | Stacked question blocks with alternating editorial offsets (left → right → left) — never text-beside-image | Three question headings, each above its vignette: V2, V3, V4 |
| 3 | `#reservas` | teach (member side) | Top-left lead text + bottom-right narrow support figure, on a white band | V5 member booking panel |
| 4 | `#marca` | differentiate | Single narrow column, type-led, near-empty (the calm section) | The three brand modes from PRODUCT-BRIEF §4 as prose |
| 5 | `#migracion` | differentiate | Full-bleed warm sand band, heading + one wide figure | V6 messy→clean roster merge — the page's one **second-read moment** |
| 6 | `#claro` | de-risk / teach | Hairline-separated full-width rows (no cards) | Four true statements sourced from brief §6 ("do not claim" turned into honesty) |
| 7 | `#contacto` | convert | Stacked center close (deliberate, only centered section) | H2 + sub + one primary CTA (mailto) + plain-text address |

Header: N9 edge-aligned minimal (lockup left, three anchors + quiet bordered CTA right,
sticky, 64px). Footer: Ft2 single inline rule (small lockup + © line). Layout families: 7
sections, 7 distinct anchors; zigzag count = 1 (the hero, as briefed).

## Vignette inventory (all sample data obviously generic, every figcaption says "ejemplo")

| V | Panel | Vertical flavor | Sample data |
|---|-------|-----------------|-------------|
| V1 | Agenda del día (staff) | academia de danza | 4 session rows, cupos `8/10`-style tabular; **the 18:00 row is the plum claimed slot** (the mark's story) |
| V2 | Ficha de cliente | gimnasio de escalada | Mariana Torres · Boulder 10 entradas · quedan 4 · vence 28 may · último pago $650 MXN · chip `vigente` (green) |
| V3 | Venta registrada / recibo | escuela de música | Recibo #0483 · Mensualidad piano grupal · $900 MXN transferencia · vigencia 12 jun–12 jul · ghost actions "Enviar por WhatsApp / correo" |
| V4 | Pase de lista de hoy | estudio de yoga | 4 check-in rows with green checks, one backdated row tagged "capturada hoy" |
| V5 | Reservar (member, narrow) | escuela de natación | Week rows with live cupo ("quedan 3"), one `lleno` row with NO button (no waitlist — true), plan footer line |
| V6 | Migración merge | neutral | 3 messy source rows (libreta / WhatsApp / Excel, three spellings of María López) → 1 clean roster row |

Rules inside vignettes: `tabular-nums` everywhere, MXN with `&nbsp;`, semantic green/amber/red
only as product states, hairline `<figure>` frames only (no OS/browser chrome), plum only on
the claimed slot + the member "Reservar" minis (the product's primary action).

## Copy inventory (es-MX, tú, sentence case)

- H1 (shipped): **"Quién vino, quién pagó, quién sigue."** — 36 chars, the owner's mental load in one line.
- Sub: "iBookit lleva la agenda, los clientes, los cobros y la asistencia de tu negocio — con tu marca, no la nuestra." (20 words)
- One label per intent page-wide: **"Agenda una demo"** (nav quiet button, hero primary, contacto primary). Secondary intent: "Ver el producto" (typographic link → #mostrador).
- S2 H2 "Cada pantalla responde una pregunta" + question H3s: "¿Quién es cada cliente?" / "¿Qué pagó y cuándo vence?" / "¿Quién vino hoy?"
- S3 H2 "Tus clientes reservan solos"
- S4 H2 "Con tu marca, no la nuestra" — three modes: wear yours (with the sourced "dos negocios ya operan así" claim), use ours, we design you one
- S5 H2 "El día uno empieza con tu lista completa"
- S6 H2 "Claro desde el principio" — 4 honest rows: money never passes through us / nothing to install / your data exports to Excel / WhatsApp messages are prefilled, sent by you
- S7 H2 "Platícanos de tu negocio" + hand-done onboarding as the trust cue

Zero invented proof: no counts, no testimonials, no logos, no stats, no pricing. The only
factual claims are lifted from PRODUCT-BRIEF (§3 features, §4 services, the two-businesses
line, Mexico-first).

## Token plan

All color via custom properties from the five locked hexes; ramps via `color-mix` (hairlines,
sand band, plum hover, ink-soft body). Semantic state hexes (green/red/amber) added as
permitted. Type: Hanken 400/600 only; 5 page sizes (display clamp ≤3.6rem, h2, 1.25rem
lede/h3, 1rem body, .875rem small) + a 13px micro size scoped to vignette internals. Spacing:
one 4pt scale named by role. Motion: one CSS hero entrance (staggered ≤500ms) + one
IntersectionObserver for vignette settle-in (220ms, motivated: the ledger filling in) + a
scrollspy IO for nav `aria-current`. `prefers-reduced-motion` kills all of it.

---

# Pre-ship gates (run after the build, verified in a real browser via localhost)

## DISTILLED-TASTE hard gates

- **Section count**: declared 7, delivered 7 (`#inicio #mostrador #reservas #marca #migracion #claro #contacto`). PASS
- **Layout-family repetition**: 7 distinct anchors, zigzag count = 1 (hero only). No split-header, no 3-equal-column icon grid, no card-in-card (rows inside panels are hairline-separated, not nested cards). PASS
- **Eyebrows**: zero on the page. No section numbering, no Paso 1/2, no scroll cues, no decorative status dots (the chips inside vignettes are product states, which IDENTITY permits). PASS
- **Invented proof**: none. No counts, testimonials, logos, stats, uptime, pricing. The two factual claims ("dos negocios ya operan así", hand-done onboarding) are sourced from PRODUCT-BRIEF §4. Every vignette figcaption says "ejemplo". PASS
- **Banned words**: grep for *impulsa/potencia/transforma/revoluciona/solución integral/todo-en-uno/siguiente nivel/nueva era* and `href="#"` → 0 matches. PASS
- **Accent budget**: plum appears as — hero CTA (~8.6k px²), one claimed agenda row (~14k px²), mark's filled cell (~40 px²), two mini Reservar chips, contacto CTA, focus rings, scrollspy underline. Worst viewport (hero at 1280×800) ≈ 2.3% < 3%. Nav CTA deliberately quiet (hairline border) to protect the budget. PASS
- **Tokens**: every color runs through `var()`; ramps via `color-mix` from the five locked hexes; semantic green/amber/red added as IDENTITY permits. `--accent-ink` white vs plum measured ≈5.5:1. Body is ink on canvas (≈14:1 AAA); muted reserved for captions/labels. PASS
- **Type**: Hanken 400/600 only, display capped at 3.6rem (< 5.5rem cap), H1 = 36 chars, 5 page sizes + 13px vignette micro, `tabular-nums` on every panel, `text-wrap: balance/pretty`. PASS
- **Motion**: one CSS hero entrance (4 staggered rises, 60ms step, 420ms each), one IO vignette settle (220ms, translate/opacity only), scrollspy IO. No scroll listeners, no infinite loops, no transition-all. `prefers-reduced-motion` collapses everything; no-JS users see everything (reveal classes only attach when JS + motion allowed). PASS
- **A11y/meta**: lang="es-MX", title, description, og set (og:image left as a publish-time export of `og-template.svg` — commented in head), inline SVG favicon (appicon as data URI), skip-link, landmarks (banner/nav/main/7 labelled regions/contentinfo verified in the accessibility tree), `:focus-visible` plum ring, fake in-vignette controls `aria-hidden`. PASS
- **Structure plumbing**: `overflow-x: clip` on html+body, `min-height:100dvh`, `scroll-padding-top` for the sticky nav, `minmax(0,1fr)` grid tracks, named z-scale (only `--z-nav` needed), `@media (pointer:coarse)` 48px targets. PASS

## Responsive verification (measured, not reasoned — iframe probes in Chrome)

| Width | Doc overflow | Nav | H1 lines | Hero CTA in fold |
|---|---|---|---|---|
| 320 | none (after fix) | 64px, one line (links hidden, mark + CTA) | 3 (max allowed) | yes (bottom 521) |
| 375 | none | 64px | 2 | yes (476) |
| 414 | none | 64px | 2 | yes (444) |
| 768 | none | 64px, one line with all links | 2 | yes (423) |
| 1280×800 | none | 64px | 2 | yes (452) — headline+sub+CTA+vignette all in fold |

One defect found and fixed: at 320 the recibo action chips and the "capturada hoy" chip
overran their rows → `@media (max-width:400px){ .row{flex-wrap:wrap} }`. Re-probed: clean.

## Hero copy — shipped + 2 alternates (owner picks)

1. **SHIPPED** — H1: "Quién vino, quién pagó, quién sigue."
   Sub: "iBookit lleva la agenda, los clientes, los cobros y la asistencia de tu negocio — con tu marca, no la nuestra."
2. ALT A — H1: "El mostrador de tu negocio, en orden."
   Sub: "Agenda con cupos en vivo, ficha por cliente, recibos numerados y pase de lista — sin libreta, sin Excel, sin pendientes."
3. ALT B — H1: "Tu lugar para cada clase y cada cliente."
   Sub: "Tus clientes apartan su lugar desde el celular; tú llevas cobros, vigencias y asistencia desde el mostrador."
   (ALT B is the one that names the mark's story — *el lugar apartado*.)

## Open questions / deviations

- **`hola@ibooki.lat`** is asserted as the contact route (mailto CTA + visible address). The
  domain is locked but the mailbox isn't sourced anywhere — owner should confirm or swap the
  address before publish. There is no form because a static form would be fake plumbing.
- **og:image** intentionally omitted (no external resources allowed in a self-contained file);
  comment in `<head>` points at the final `og-template.svg` as the export source.
- **No privacy/ToS footer links** — the pages don't exist yet (ToS route is in progress per
  the tracker) and `href="#"` is banned; add them when real URLs exist.
- **Marca section** exceeds the ≤25-word sub guideline (three short paragraphs): the three
  brand modes are the §4 sales pitch and each needed its own sentence. Deliberate.
- **Kids' classes avoided in sample data** (brief §2: don't headline kids' academies until
  parent/child separation ships) — the dance academy vignette uses adult class names.
- The claimed agenda slot renders 11/12 with no sub-roster — kept to one plum row so the
  accent stays the mark's gesture, not a highlight color.
