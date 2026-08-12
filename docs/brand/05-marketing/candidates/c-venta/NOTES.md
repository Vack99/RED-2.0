# Candidate C — venta (2026-08-11)

One self-contained file (`index.html`): inline CSS/JS/SVG, Hanken via Google Fonts, inline favicon.
Sales spine inherited from `../../reference-old-sales-page.dc.html`; skin from
`../../../03-visual-identity/IDENTITY.md`. Four parts, nothing else: fold → four questions →
moat + fit → close.

## Copy inventory (all claims checked against PRODUCT-BRIEF.md)

| Slot | Text | Source |
|---|---|---|
| H1 | La recepción de tu **{giro}**, en orden. | old page hero, stanza-broken (3 fixed lines — zero layout shift while rotating) |
| Giros (9) | estudio de yoga · academia de jiu-jitsu · box de CrossFit · escuela de natación · academia de baile · rocódromo · taller de cerámica · escuela de música · estudio de pilates | old page list **minus** `academia de futbol` — brief §2 says don't headline kids' academies until parent/child ships; a rotating H1 is a headline |
| Sub | Clientes, pagos, agenda y asistencia — sin cuaderno, sin Excel, sin perseguir el grupo de WhatsApp. Con tu marca y tus clientes ya cargados. | old page, tightened |
| CTA (×2) | Escríbenos por WhatsApp | old page |
| De-risk | Web en tu navegador — nada que instalar. | old page, tightened |
| Visual | Agenda panel: 4 rows, live cupos (8/10 · 11/12 · 6/12 · lleno), one plum claimed row; caption "La agenda de un día — datos de ejemplo." | b-mostrador hero vignette, kept honest |
| Band 2 | Cuatro preguntas, respondidas en vivo. + the old page's 4 Q&A pairs, one line each | old page §preguntas, tightened |
| Band 3 | Se ve como tu negocio, no como el nuestro. / Cargamos tu lista a mano — nunca empiezas de cero. / El cobro sigue en tu mostrador; iBookit lo registra y manda el recibo. | owner-locked lines, verbatim |
| Fit lead | Para cualquier negocio que vende un lugar en una clase, a personas que regresan cada semana: | old page §para-quien, tightened |
| Chips | old page's 8 genres + "…y más" (dashed) | old page; matches brief §2 taxonomy |
| Close | Cuéntanos de tu negocio. + Armamos tu cuenta, cargamos tu lista y te acompañamos en el arranque — a mano, negocio por negocio. + CTA + hola@ibooki.lat | old page cierre |
| Footer | mark + iBookit + ibooki.lat, one line | — |

Dropped from the old page (deliberate): dos-apps feature tables, brand 3-card section ("dos negocios
ya operan así" is supportable per brief §4 but not in the locked 4-part structure), migración band
(compressed into moat line 2), nav links.

## Fold measurements (browser-verified, Hanken loaded)

**375×667** — element bottoms: H1 179 · sub 296 · CTA 372 · de-risk 401 · vignette 630 · caption 662.
**Entire pitch including the visual fits the fold** (5 px spare). No horizontal overflow (content 364 ≤ 375).
Longest rotating line ("academia de jiu-jitsu,") 231 px of 324 available.

**1280×800** — hero = exactly 100dvh (64 header + 736). Bottoms: H1 384 · sub 489 · CTA 589 ·
de-risk 618 · vignette 513 · caption 545. Fold complete incl. visual. Longest niche line ~359 px of 489.

**320×600** — no horizontal overflow (309 ≤ 320); H1+sub+CTA+de-risk end at 408; vignette caption 669
(69 px below fold — accepted, CTA-before-visual priority). H1 steps to 1.5rem under 360 px.

**768×1024** — fold complete (caption at 824); no overflow.

**Total page height at 1280×800: 1742 px = 2.18 viewports** (fold 736+64 · preguntas 250 · porqué 329 ·
cierre 308 · footer 54).

## Gate results

- Banned words (impulsa/potencia/transforma/revoluciona/solución integral/todo-en-uno/siguiente nivel/nueva era): **0 hits**.
- Invented proof: none — no counts, testimonials, logos, stats, pricing.
- Dead hrefs: none — 4 anchors total (skip-link, 2× CTA, mailto), all real.
- Rotation: verified cycling at 2.6 s, opacity/transform only, paused while tab hidden; `prefers-reduced-motion` verified → static "negocio", no entrance animation.
- No-JS: CTA hrefs default to the mailto in markup; H1 shows "estudio de yoga" static.
- Type: 5 sizes page-wide; Hanken 600/400; `tabular-nums` on the agenda panel; fallback `size-adjust` metrics.
- AA/AAA: body runs at ink-soft (~8.5:1, AAA); muted only on small meta (~5.6:1, AA); plum niche on canvas 6.0:1 (AAA large); white on plum 5.5:1 — claimed-row meta uses full white (no 78 % tint).
- Landmarks: header/main/footer + labelled sections, skip-link, `lang="es-MX"`, og tags, favicon inline.
- Plum coverage: **1280×800 fold ≈ 3.2 %** (CTA 1.2 + claimed row 1.4 + niche word ~0.5). **375×667 fold ≈ 13 %** (full-width CTA 6.7 + claimed row 5.3 + niche ~0.9) — over the ≤3 % craft gate, kept deliberately: all three are IDENTITY-sanctioned uses (action, the claimed cell, one accent moment) and the CTA + claimed slot are owner-specified; selling wins over the demoted craft rule.

## Open items (owner)

1. **WhatsApp number is empty** — `const WHATSAPP = ""` at the top of the inline script (digits with lada, e.g. `5215512345678`). Until filled, both CTAs fall back to `mailto:hola@ibooki.lat` exactly like the old page — same label, mail door.
2. **og:image** — export `03-visual-identity/final/og-template.svg` to PNG (1200×630) at publish; commented placeholder in `<head>`.
3. Vignette is example data (danza academy); swap for a real product capture later if wanted — keep the caption's "datos de ejemplo" honesty either way.
