# Candidato A — "El lugar, tipográfico" — design notes

Direction A: quiet, type-led, editorial. No product-UI imagery anywhere. Type, space and the
warm canvas carry the page; the 3×3 mark's story (tu lugar apartado) appears exactly once as
the page's single second-read moment. Light theme only.

---

## PLAN (written before any markup)

### Committed decisions

- **Hero scale: H1 marquee**, committed. A three-clause typographic stanza fills the fold —
  one clause per line, three lines (the allowed maximum), left axis. Mini-minimalist was the
  other candidate; rejected because with zero imagery on the whole page, the type must *be*
  the image somewhere, and the hero is that somewhere. Recessive ≠ invisible.
- **Primary axis: left-biased**, held on every section including the close.
- **Narrative spine: la semana** — the schedule as a grid of places, one of them claimed.
  Named in copy only at the mark moment (section 3) and echoed once in prose ("caben en la
  misma semana", section 5). Never decorated a second time.
- **Conversion intent: contact/demo** (brief gives no pricing and no self-serve signup).
  One primary label page-wide: **"Agenda una demo"** (nav → #contacto, hero → #contacto,
  contacto → mailto). One secondary intent: **"Cómo funciona"** (hero link + nav link, both
  → #como-funciona). No other CTA intents exist.
- **Section count: LOCKED AT 6.** Delivered count must equal 6.

### Section map (6 sections; nav + footer are landmarks, not sections)

| # | id | Job | Composition anchor (each family used once) | Background |
|---|----|----|-------------------------------------------|------------|
| 1 | `#inicio` | **Hook** | Top-left marquee stack: 3-line H1 + sub + CTA pair, negative space right/bottom | lienzo |
| 2 | `#como-funciona` | **Teach** (what it answers) | Ruled ledger: 4 full-width dt/dd rows under hairlines, question left / answer right | lienzo |
| 3 | `#lugar` | **Brand + teach** (member side; THE second-read moment) | Asymmetric diptych, text left / large mark right — the page's one text/image split | superficie |
| 4 | `#marca` | **Prove** (identity swap + done-for-you migration — the honest proof, no fabricated stats) | Two editorial prose blocks, second block off-grid indented | lienzo-hondo (ramp) |
| 5 | `#para-quien` | **Qualify** | Typographic word-field: one flowing list, ~7 items emphasized in ink | lienzo |
| 6 | `#contacto` | **Convert** | Compact close: statement + one primary CTA + one trust cue | superficie |

Background pacing: lienzo → lienzo → blanco → hondo → lienzo → blanco (intensity varies
twice+, same warm family, no dark section). Density pacing: airy hero → dense ledger → calm
diptych → medium prose → airy field → compact close.

### Copy inventory (es-MX, tú, sentence case)

- **H1 (shipped):** "Quién pagó, quién viene, quién llegó." (37 chars, 6 words, 3 lines)
- **Hero sub:** "iBookit lleva la recepción de tu negocio — clientes, pagos, agenda y
  asistencia — con tu marca, no la nuestra." (19 words)
- **S2 h2:** "Las preguntas del día, respondidas en vivo." · sub names the replaced mess
  (libreta / Excel / grupo de WhatsApp). Four rows = the brief's four questions, each
  answered by a real screen (Clientes, Vender, Agenda, Asistencia) named as a quiet index
  label. The Vender row carries the honest payments line (cobro en tu mostrador, iBookit lo
  registra y emite recibo).
- **S3 h2:** "Nuestra marca es una semana." · grid = horario, celda ciruela = lugar
  apartado; second paragraph = member app truths (web móvil sin instalar, lugares en vivo,
  reservar/cancelar/favoritas, clases restantes y vigencia).
- **S4 h2:** "Con tu marca, desde el día uno." · Block A "Se ve como tu negocio." (identity
  swap; the one true proof: dos negocios ya operan así y no se parecen) · Block B "Abre con
  tu gente adentro." (migration promise) · nota: puesta en marcha a mano.
- **S5 h2:** "Hecho para negocios que llenan clases." · rule line (la línea es cómo vendes,
  no el giro) · word-field sourced ONLY from the brief's genre table · closing line "…caben
  en la misma semana."
- **S6 h2:** "¿Lo vemos con tu negocio?" · empieza con una conversación · CTA mailto +
  visible address.
- **Footer:** iBookit · ibooki.lat · © 2026. No link farm.

### System

- **Colors:** only the five locked hexes as `:root` tokens + `color-mix()` ramps of them
  (tinta-suave for long body ≥7:1, lienzo-hondo band, linea hairline, ciruela-honda hover).
  No new hues. Accent = CTA fills, link underlines, focus ring, the claimed cell. Budget ≤3%.
- **Type:** Hanken 600/400 only. Five sizes total: display `clamp(2.75rem…5rem)`, h2
  `clamp(1.75rem…2.375rem)`, lead 1.375rem, body 1.125rem, small 0.9375rem. Tracking −0.02em
  display, +0.08em on the uppercase index labels. `text-wrap: balance/pretty`.
- **Spacing:** 8-based scale named by role (xs…3xl), ≥96px between majors, hero bottom
  padding ≥1.3× top.
- **Motion (all of it):** one CSS-only staggered hero entrance (3 elements, 40ms steps,
  420ms, done ≤500ms) + one IntersectionObserver moment: the plum cell "claims" its place
  when #lugar enters view — the animation *is* the story (apartar el lugar), which is its
  one-sentence motivation. Reduced-motion collapses both to ≤150ms opacity. No scroll
  listeners, no other animation.
- **Eyebrows: zero.** Section h2s stand alone.

---

## POST-BUILD — pre-ship gate results

### DISTILLED-TASTE hard gates

- 3-equal-column icon grid / card-in-card / colored side-stripe cards — **none exist**; the
  page has zero cards and zero icons (type only).
- Eyebrows — **zero used**.
- Section numbering / Paso 1 / scroll cues / version stamps / status dots — **none**. The
  uppercase screen names (CLIENTES…) are real product vocabulary indexing each answer, not
  decorative metadata.
- Headline italics / gradient text / aurora blobs / glassmorphism / custom cursors /
  carousels — **none**.
- Emoji as icons — **none** (no icons at all).
- `transition-all`, uniform hover-scale, 4-effect hovers — **none**; transitions name their
  properties, buckets 120/220/420ms, `--ease-out` for entrances.
- Layout families: marquee stack / ruled ledger / diptych / offset prose / word-field /
  compact close — **6 sections, 6 distinct families, zero repeats; zero zigzags** (the one
  text/image split appears once, at #lugar).
- Split-header ban — respected: every h2 stacks over its own body at ≤65ch.
- Fabricated proof — **zero**: no counts, no testimonials, no logos, no stats, no pricing.
  The only proof claims are sourced from the brief ("dos negocios ya operan así",
  hand-done migration, hand-done onboarding).
- Banned es-MX words — grep-clean: no impulsa / potencia / transforma / revoluciona /
  solución integral / todo-en-uno / siguiente nivel / nueva era. No exclamation marks.
- Real destinations — every anchor targets a real id; the mailto is the only external-ish
  href besides the Google Fonts links. No `href="#"`.
- Accessibility — skip-link, landmarks (header/nav/main/sections-labelledby/footer),
  `:focus-visible` rings (instant, ≥3:1), 48px touch targets, `lang="es-MX"`,
  reduced-motion, `overflow-x: clip` on html+body, `100dvh`.
- Contrast (computed): tinta on lienzo ≈ 14:1 (AAA) · tinta-suave body ≈ 12:1 (AAA) ·
  tenue small/labels ≈ 5.7:1 (AA, used only ≥15px annotations) · lienzo on ciruela ≈ 6.1:1
  (AA at button size/weight). Accent-ink rule proven: every plum fill sets its own
  `color: var(--lienzo)` in the same rule.
- Accent budget at 1280×800: nav button + hero button ≈ 1.3% of viewport; worst case
  (#contacto in view) ≈ 1.5%. Under 3% everywhere.

### 320 / 375 / 414 / 768 — MEASURED in a real browser (not estimated)

Probed with same-origin iframes at exact widths against the served page:

| width | scrollWidth (overflow?) | nav height | hero CTA bottom (fold) | H1 lines |
|---|---|---|---|---|
| 320×700 | 309 — none | 64px, one line | 564px — in fold | 3 |
| 375×700 | 364 — none | 64px | 531px — in fold | 3 |
| 414×700 | 402 — none | 64px | 531px — in fold | 3 |
| 768×900 | 757 — none | 64px | 511px — in fold | 3 |
| 1280×800 | 1269 — none | 64px | 576px — in fold | 3 |

- Nav: quiet links hidden ≤640px (no hamburger — both targets are sections the scroll
  reaches anyway); **below 375px the lockup swaps to the mark alone** (36px — legal per
  IDENTITY above 20px) so lockup + CTA never overflow 320.
- Ledger, diptych, marca blocks and CTA rows all stack single-column below their
  breakpoints; word-field is inline `li` and wraps freely; #lugar mark floors at 150px.
- Two defects caught by the live check and fixed:
  1. `.lockup svg{display:block}` out-specified `.lockup-marca{display:none}` — both
     lockups rendered at once. Fixed with `svg.lockup-*` selectors.
  2. Nav measured 80px (at the ceiling); padding tightened to land at 64px.
- Claim animation verified end-to-end: `.reclamada` end-state computes opacity 1 /
  identity transform. Added a guarded fallback — IO always fires an initial callback when
  alive, so a 4s timer force-claims the cell **only if IO never ran** (the mark must never
  sit cell-less); users who scroll later still get the animated moment.

### Hero copy — shipped + 2 alternates (owner picks)

1. **SHIPPED** — H1: "Quién pagó, quién viene, quién llegó." ·
   Sub: "iBookit lleva la recepción de tu negocio — clientes, pagos, agenda y asistencia —
   con tu marca, no la nuestra."
2. **ALT 1** — H1: "La recepción de tu negocio, en orden." ·
   Sub: "Clientes, pagos, agenda y asistencia al día, desde el mostrador o desde tu
   teléfono — con tu marca."
3. **ALT 2** — H1: "Cada nombre, cada pago, cada clase." ·
   Sub: "Deja la libreta, el Excel y el grupo de WhatsApp: la recepción entera, en vivo y
   con tu marca."
   (If ALT 2 ships, reword the #como-funciona sub — it currently owns the libreta/Excel/
   WhatsApp beat and would collide.)

### Open questions / declared deviations

- **`hola@ibooki.lat` is unverified** — the brief sources no contact address, but a
  contact-intent page needs a real vector. Shipped as the mailto + visible text; owner must
  confirm or swap the mailbox before deploy.
- **`og:image` points at `https://ibooki.lat/og.png`** — speculative URL; needs a PNG export
  of `og-template.svg` at deploy (SVG isn't valid as an OG image). All other og tags are
  self-contained.
- **No privacy/terms links in the footer** — the pages don't exist; the real-destinations
  rule outranks the completeness checklist. Add when the ToS route ships.
- **Favicon data-URI carries literal locked hexes** — CSS custom properties can't reach a
  data-URI asset; the two hexes are the locked plum + lienzo, unchanged.
- The fifth question ("cómo va el negocio") is real in the brief but roadmap — deliberately
  absent from the page (do-not-claim discipline beats completeness).
