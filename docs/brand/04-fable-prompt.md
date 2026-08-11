# iBookit — Design-System Prompt (Phase D)

Self-contained prompt for a design-system AI (Claude Design "Design System" mode or
equivalent). Paste as-is; it assumes NO repo access. Output feeds two targets: the iBookit
marketing site (greenfield) and the product's house theme (a fixed 33-key contract).

---

## PROMPT

You are producing the **design-token system** for iBookit. The brand identity is already
decided and locked — you are encoding it, not designing it. Tokens and system only.

**Product.** iBookit runs the front desk of membership-and-booking businesses — roster,
schedule, payments recorded at the desk, attendance — and ships wearing each client
business's own brand. Vertical-neutral: a piano school, a climbing gym and a dance academy
must all see themselves in it. Mexico-first; all UI copy is es-MX (tú register).

**Audience.** Owner-operators (1–15 staff, 30–600 clients), on their phones, no IT dept.

**Brand adjectives.** Recessive not invisible · warm not playful · plain not basic · modern
not techy. The brand must never be louder than a client's brand.

**Locked identity (givens — do not reinvent):**

- Wordmark "iBookit", Hanken Grotesk 600. Type: Hanken Grotesk variable — display 600,
  body 400, tabular numerals for money/dates.
- Mark: 3×3 outlined-cell grid, one filled accent cell ("your reserved spot").
- Accent — ciruela/plum: light `#8A4A6C`, dark `#C287A8`.
- Neutrals — light: canvas `#FAF8F4`, surface `#FFFFFF`, ink `#201B14`, muted `#6B6257`;
  dark: canvas `#16130E`, surface `#1E1A14`, ink `#F2EDE5`, muted `#A79B8C`.

**Deliver two-tier tokens** (primitive → semantic; NO component tier) as CSS custom
properties, light and dark mappings both first-class:

1. **Primitives:** full ramps derived from the neutrals + plum above (do not drift their
   anchors), a type scale (Hanken, marketing-display through caption), spacing scale, radii
   (the identity favors soft 3:12 rounding), shadows (soft, warm-tinted, sparse).
2. **Semantic roles:** `surface`, `surface-raised`, `sunk`, `on-surface`, `on-surface-muted`,
   `border`, `border-soft`, `accent`, `on-accent`, `accent-soft`, `focus`, plus states —
   `state-success`, `state-error`, `state-warning`, `state-info` — each with `-soft` surface
   variants. States stay green/red/amber/blue-gray families: they carry meaning (plan
   vigente/vencido/por renovar) and must never collide with or lean plum.

**Target A — marketing site (greenfield).** The semantic set above, light-first. WCAG: AA
minimum everywhere, AAA for body text. Accent is scarce: links, primary action, one
highlight per view.

**Target B — house product theme.** Map the same DNA onto this EXACT 33-key contract
(names are historical — keep them verbatim, one light + one dark value each):
`canvas, surface, sunk, line, line-soft, yellow, gold, yellow-dim, yellow-soft, yellow-edge,
press-yellow, yellow-fg, yellow-core, silver, silver-dim, silver-core, fg, muted, muted-soft,
green, red, warning, green-soft, red-soft, warning-soft, wa-bubble, wa-bubble-fg,
wa-bubble-meta, ink, glass, scrim, tab-bg, backdrop`.
Role gloss: `yellow*` = the ACCENT family (map to plum, quieter than Target A — this theme
is a default that client businesses override; it must read deliberate but self-effacing);
`silver*` = secondary/neutral emphasis; `green/red/warning(+soft)` = semantic states;
`wa-bubble*` = WhatsApp message preview (stay near WhatsApp's familiar green in light);
`glass/scrim/backdrop` = overlays; `tab-bg` = mobile tab bar. Contrast: `fg` on `canvas`
and on `surface` ≥ 7:1; `muted` ≥ 4.5:1; every `*-fg`/`*-core` pairing AA on its family.

**Do not:** UI mockups, screens, component designs, layouts, logo alterations, new hues
beyond ramps of the given anchors, invented product claims, any pairing that fails the
stated contrast. Output: the two CSS custom-property blocks (Target A; Target B light+dark)
with a one-line rationale per semantic group — nothing else.
