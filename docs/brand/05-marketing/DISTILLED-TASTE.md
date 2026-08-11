# Distilled taste guide — iBookit marketing page

Extracted 2026-08-11 from 14 third-party design skills (hallmark + the taste-skill family),
filtered against the locked identity (`../03-visual-identity/IDENTITY.md`) and the product
truth (`../PRODUCT-BRIEF.md`). **Not a source of truth** — a curated steal/ban/ignore list.
Two distillation passes below: page-craft skills, then imagegen/brand skills.

---

## PASS 1 — page-craft skills (hallmark, design-taste-frontend ×2, high-end-visual-design, gpt-taste, minimalist-ui, industrial-brutalist-ui, stitch-design-taste)

## STEAL — rules worth applying to the iBookit marketing page

### Typography & scale
- Cap display at **≤5.5rem (88px)**; default `clamp(2.75rem, 5vw + 1rem, 5.25rem)`. Above that, headlines crowd at 1280–1440px. (hallmark/typography)
- Size headline **by character count**: ≤50 chars = full display; 51–90 = one rung down; >90 = rewrite. Write hero H1s at **≤7 words / ≤50 chars** from the start. (hallmark; gpt-taste "2-line iron rule")
- H1 must never exceed **2–3 lines** at any width — fix by widening the container, not by shrinking below the scale. (gpt-taste)
- One ratio for the whole scale (1.25 major third), **max 5 sizes on a page**. More hierarchy = weight/color/space, not another size. (hallmark)
- Our locked Hanken 600/400 is only a 200-unit weight gap (skills want 300+): compensate with **size + color + space**, and use tracking (`-0.02em` display, `+0.08em` on small caps labels) as the third register. (hallmark, adapted)
- Body ≥16px, line-height 1.5–1.65, measure **45–75ch (`max-width: 65ch`)**; display line-height 1.05–1.2. (hallmark, minimalist-ui)
- `font-variant-numeric: tabular-nums` on every price/date/count row; `font-display: swap` + `size-adjust` fallback metrics to kill CLS. (hallmark)
- Real punctuation only: `" "` `…` `’`, `&nbsp;` before units (`10 min`, `$450 MXN`). Never straight quotes or `...`. (hallmark/copy)

### Layout & composition
- Pick a **primary axis** (left-biased for us) and hold it. Centre-biased is a default, not a decision. (hallmark/layout)
- **Section-layout-repetition ban**: a layout family appears at most once. 8 sections ⇒ **≥4 distinct families**. (design-taste-frontend 4.7)
- **Zigzag cap 2**: the third consecutive image-left/text-right split is a fail. (design-taste-frontend)
- Bento/feature grid has **exactly as many cells as content items** — no blank tile, no dead corner; `grid-auto-flow: dense`. (design-taste-frontend, gpt-taste)
- **Split-header ban**: no "big headline left + small explainer paragraph right". Stack vertically, body at 65ch. (design-taste-frontend)
- CSS Grid for page structure, Flexbox for component internals; never `calc(33% - 1rem)` math. Image-bearing tracks use **`minmax(0, 1fr)`**, never bare `1fr`. (hallmark, v1)
- Nav renders on **one line at desktop, ≤80px tall** (64–72 default). Two-line nav = broken. (design-taste-frontend)
- Every clickable label is single-line at 320–1920px: shorten the label first, then `white-space: nowrap`, then collapse the row. Spanish labels run ~25% longer than English — budget for it. (hallmark gate 49 + responsive i18n)
- Root gets `overflow-x: clip` on **both `html` and `body`** (`clip`, not `hidden` — preserves sticky). `min-h: 100dvh`, never `100vh`/`100vw`. (hallmark gate 34, all skills)
- Display headers get `overflow-wrap: anywhere; min-width: 0` so long compounds ("recordatorios-automáticos") don't overflow. (hallmark gate 51)
- Two sticky-at-`top:0` elements = bleed. Offset secondary stickies to `top: var(--banner-height)` and split `--z-sticky` from `--z-sticky-nav`. (hallmark gate 56)
- Named 6-level z-scale (`--z-sticky: 200` … `--z-toast: 500`); no `z-9999`. (hallmark)

### Spacing
- One **4pt scale, named by role** (`--space-xs` … `--space-4xl`); any value off-scale (`padding: 17px`) is a tell. (hallmark)
- **Vary the gaps.** If every gap is 24px the page is a template. `--space-3xl` (96px) minimum between major sections; tighten one section, expand another deliberately. (hallmark/layout)
- Hero **bottom padding ≥ 1.3× top padding** — symmetric padding makes the hero float off the page. Top padding caps at ~6rem. (hallmark gate 44, design-taste-frontend)
- `gap` for siblings; `margin` only for optical breakout. (hallmark)

### Color use
- **Accent ≤3% of any viewport** (5% hard ceiling). Plum marks active nav, focus ring, link underline, CTA — never fills sections or big decorative blocks. (hallmark/color)
- **One accent, locked page-wide.** No teal badge in the footer of a plum page. (design-taste-frontend "consistency lock")
- Tint the neutrals toward the anchor hue — a warm canvas with cool-grey body text reads wrong and nobody can name why. Our warm neutrals already do this; keep zero-chroma greys out. (hallmark)
- Define **`--accent-ink`** and prove it against the plum fill: text-vs-fill within 5% lightness = the black-on-black shipping bug. Verify every CTA, every dark section flips its text color in the same rule. (hallmark gates 40–41)
- Body targets 7:1 (matches our AAA), large text/icons/focus rings 3:1 minimum. (hallmark/color)
- **Page theme lock**: whole page is light or dark; no warm-paper section sandwiched in a dark run. (design-taste-frontend 4.11)
- Dark mode: paper L 12–18%, ink L 92–96%, drop body weight ~50 units, raise accent lightness 5–10% and cut chroma; elevation = *lighter*, never shadow-glow. Never change the hue between modes. (hallmark)
- Every color/font in the artifact comes through `var(--token)`. One inline hex mid-build is how three colors become eight. (hallmark gate 48)

### Motion & interaction
- Three duration buckets: **micro 120ms / short 220ms / long 420ms**; exits ≈75% of enter. (hallmark/motion)
- Three named easings, `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)` for entrances. Never browser-default `ease`, never bounce/overshoot on UI state. (hallmark, minimalist-ui)
- **One orchestrated entrance** on load, staggered by CSS `--i` (60ms step, total ≤500ms). After that, content is just there — not every section fading in. (hallmark)
- IntersectionObserver only; `window.addEventListener('scroll')` is a hard ban. Animate `transform`/`opacity` exclusively. (all skills, unanimous)
- `prefers-reduced-motion: reduce` collapses spatial motion to ≤150ms opacity crossfade. (hallmark)
- **Motion must be motivated** — hierarchy, storytelling, feedback, or state change. If you can't say what it communicates in one sentence, cut it. (design-taste-frontend 5)
- Focus rings appear **instantly** (never transitioned), `:focus-visible`, ≥3:1. (hallmark)
- Ship all 8 states for interactive elements: default / hover / focus-visible / active / disabled / loading / error / success. Disabled needs three channels (opacity + cursor + attribute), not opacity alone. (hallmark)
- Input rules: border-width never changes between states; focus is `outline` + `outline-offset`, not `border`; input height == adjacent button height (44px floor); reserve `min-height: 1lh` for the helper/error slot so errors don't shove the page. (hallmark gate 39)
- Silent success over toasts; optimistic update + Undo over confirm dialogs; tooltip hover-delay 800ms, focus-delay 0ms. (hallmark/microinteractions)
- `@media (pointer: coarse) { min-height: 48px }` — this audience is on phones. (hallmark/responsive)

### Copy & structure (es-MX)
- **No invented numbers.** No "+500 negocios", "ahorra 5 horas a la semana", "99.9% uptime". Use `—` + "dato por confirmar", ask, or drop the proof slot. Same for testimonials and logo walls. (hallmark gate 46 — hardest-hitting rule for us; forge is the only real operator)
- Banned Spanish equivalents of the AI-cliché set: *Impulsa · Potencia · Transforma · Revoluciona · Lleva tu negocio al siguiente nivel · Solución integral · La nueva era de*. Concrete verbs and named nouns instead. (copy.md, localized)
- Buttons carry the verb of the action: *Cobrar*, *Pasar lista*, *Agendar clase* — never *Enviar* / *Continuar* / *Clic aquí*. (hallmark/copy)
- **One label per intent, page-wide.** Pick *Empieza gratis* and use it in nav, hero, and footer — not three synonyms. (design-taste-frontend)
- Errors in three beats: what happened / why / what to do. No "¡Ups!", no exclamation marks in error states, no humor on failure paths. (hallmark/copy)
- Empty states in three beats: what's empty → why it matters → one button. (hallmark/copy)
- Per section: headline ≤8 words + sub-paragraph ≤25 words + one visual or one CTA. Anything more must justify itself. (design-taste-frontend 4.9)
- Lists >5 items get a different component (grouped chunks, 2-col cards, scroll-snap pills) — not a 10-row table with a hairline under each row. (design-taste-frontend 4.9)
- Testimonials: ≤3 lines, attribution = name + role + business, never name alone. (design-taste-frontend 4.10)
- **Copy self-audit before ship**: re-read every visible string; replace any cute-but-wrong phrase with a plain functional sentence. (design-taste-frontend)

### Hero patterns
- Hero must **fit the fold at 1280×800**: headline ≤2 lines, subtext ≤20 words and ≤4 lines, primary CTA visible without scrolling. (design-taste-frontend 4.7 + hallmark gate 44)
- **Max 4 text elements** in the hero: (eyebrow OR brand strip OR neither) + headline + subtext + CTAs. Banned inside the hero: micro-tagline under the CTAs, "usado por…" trust strip, pricing teaser, feature bullets, avatar row. Those move to their own section below. (design-taste-frontend)
- The **"Trusted by" wall lives under the hero**, never inside it — and only if the logos are real. (design-taste-frontend)
- Usable hero archetypes for us: **H2 split diptych** (headline + real product capture) or **H1 marquee** (single statement fills the fold). Avoid H4 stat-led — we have no honest hero stat. (hallmark/component-cookbook)
- Nav archetype: **N9 edge-aligned minimal** (wordmark hard-left, one CTA hard-right, space between) reads as recessive and dodges the AI-nav fingerprint. Footer: **Ft1 mast-headed** or **Ft2 single inline rule** — not the 4-column Product/Company/Resources/Legal grid. (hallmark)
- CTA archetypes: **C3 typographic link** for secondary, **C2 inline form-as-CTA** if we ever want email capture. One primary + at most one secondary of a *different* intent. (hallmark)
- Decoration in the hero needs a semantic anchor. A numeral, a cursor inside a typed command, a real screenshot — yes. A floating shape "for depth" — no. (hallmark gate 45)
- Use **real screenshots of the real admin/client apps** in a `<figure>` with at most a hairline. We have the product; that's an unfair advantage over every skill's placeholder strategy. (hallmark gate 47)
- LCP element gets `fetchpriority="high"`, never `loading="lazy"`; `width`/`height` on every image. (hallmark, design-taste-frontend)

### Anti-slop hard gates (run before shipping)
- No 3-equal-column icon-above-heading feature grid. No card-in-card. No thick colored side-stripe cards. (all skills, unanimous)
- **Eyebrows default OFF.** If any are used: max 1 per 3 sections, and the heading sits **directly underneath in the same column** — the tag-left / heading-right two-column head is an auto-fail. (hallmark gate 54, design-taste-frontend "#1 violated rule")
- No section numbering (`01 · CÓMO FUNCIONA`), no `Paso 1 / Paso 2` labels, no scroll cues ("Desliza para ver más"), no version stamps, no locale/time strips, no decorative status dots. (design-taste-frontend 9.F)
- No headline italics anywhere; emphasis = weight, accent color, or a drawn underline. (hallmark gate 38a)
- No gradient text, no aurora/mesh blobs, no floating orbs, no glassmorphism-as-decoration, no custom cursors, no auto-rotating carousel without pause. (all skills)
- No emoji as icons. One icon family, one stroke width, or no icons at all. (all skills)
- No `transition-all`, no uniform `hover:scale-105`, no element with 4 simultaneous hover effects. (hallmark gates 10–13)
- Verify at **320 / 375 / 414 / 768 px** before calling it done. (hallmark/responsive)

## BAN — anti-patterns to avoid, including bad advice inside these skills

- **gpt-taste's "Python RNG" pre-flight** — simulated `random.choice()` in a `<design_plan>` is theatre, not design. Pick deliberately and say why.
- **gpt-taste's "static interfaces are strictly forbidden" + mandatory GSAP pinning / card-stacking / scroll-scrubbed text** — a scroll-hijacked page is hostile to owner-operators on mid-range Android. Our brand is recessive; a quiet page is the correct answer, not a deficiency.
- **high-end-visual-design's entire Vibe Archetype set** — OLED `#050505` + glowing purple/emerald orbs, floating glass pills, "Double-Bezel" nested hardware cards, `rounded-[2rem]` squircles, magnetic buttons, full-screen blurred hamburger overlays. This is dark-SaaS-template cosplay and fights warm/plain/recessive on every axis.
- **high-end-visual-design's mandated eyebrow tags** (`uppercase tracking-[0.2em]` above every H1/H2) — directly contradicts hallmark and design-taste-frontend, which both name this the top tell. Side with restraint.
- **high-end-visual-design's ban on "generic 1px solid gray borders"** — a warm hairline rule is exactly right for us; ignore.
- **stitch / design-taste-frontend-v1's "Variance 8, centered hero BANNED"** — asymmetry as a quota. A centred, quiet hero is legitimate when the statement is the design; asymmetry we can't justify is just noise.
- **stitch's "inline image typography" as the signature move** (photos embedded between words in the headline) — a 2024 tic, and unreadable on a 375px phone.
- **stitch/v1's "perpetual micro-interactions — every active component has an infinite loop"** — hallmark bans infinite loops outright and it's right: they pull the eye forever, drain battery, and read as anxious. Our brand is quiet.
- **minimalist-ui's four pastel accent families** (pale red/blue/green/yellow) — multi-hue accents shred the one-plum discipline. One accent, scarcely.
- **minimalist-ui's "sections must never feel empty and flat — add radial light spots and background imagery at 0.03 opacity"** — that's the aurora-blob tell wearing a low-opacity disguise. Emptiness is our aesthetic; fill it with type and space.
- **minimalist-ui's editorial serif hero** (Playfair / Instrument Serif / Lyon) and its Phosphor-Bold icon mandate — fights locked Hanken.
- **industrial-brutalist-ui, wholesale** — hazard red, CRT scanlines, `border-radius: 0`, ASCII brackets, all-uppercase everything. Opposite of warm+recessive; all-caps also mangles Spanish accented glyphs and slows reading.
- **design-taste-frontend's absolute em-dash ban** — correct instinct (LLMs overuse it), wrong rule for us: the *raya* is standard Spanish punctuation. Keep the anti-tic discipline; don't adopt zero-tolerance.
- **design-taste-frontend's "even minimalist sites need generated images" + `picsum.photos` seeds** — invented stock photography on a page selling a real product is worse than no image. Ship real screenshots.
- **design-taste-frontend's "hand-rolled decorative SVGs strongly discouraged"** — our 3×3 grid mark is hand-built, locked, and correct. Ignore for the mark.
- **hallmark's "no single-font pages" and "headings must contrast body by ≥300 weight units"** — both lose to the locked identity. Hanken 600/400 is the system; get contrast from size, color, tracking, and space.
- **Any skill re-deriving our palette** (hallmark's OKLCH construction, stitch's Zinc/Emerald sets, high-end's archetype palettes) — our hexes are locked; tokenize them, don't let a skill regenerate them.
- **Fabricated proof of any kind** — customer counts, logo walls, "Sarah Chan, Gerente", 99.9% uptime, ★4.9. We have one real operator. A number-shaped hole is honest; a fabricated number is slop.
- **stitch's "maximum one CTA, no secondary"** — too strict for an SMB buyer who needs *Ver precios* alongside *Empieza gratis*. The real rule is no two CTAs with the *same* intent.
- **Dark mode as the aesthetic** — we have dark tokens, but the page is one locked theme with a real light default; not a dark-SaaS template.

## IGNORE — irrelevant sections

- **industrial-brutalist-ui (entire skill)** — declassified-blueprint aesthetic; nothing survives contact with a warm, quiet, Mexican SMB brand.
- **stitch-design-taste (both files)** — generates `DESIGN.md` prompts for Google Stitch, a tool we don't use; its anti-pattern list duplicates hallmark's.
- **design-taste-frontend-v1** — explicitly superseded by v2 and ~85% duplicated.
- **design-taste-frontend §2 (Brief → Design System Map)** — Fluent/Carbon/Polaris routing is enterprise product UI, not a marketing page.
- **design-taste-frontend §12 Block Library + Appendices A/B/C** — install commands for design systems we won't install.
- **hallmark's verb machinery** (`audit` / `redesign` / `study`, WebFetch DNA extraction) — greenfield with locked identity; nothing to audit.
- **hallmark's diversification apparatus** (`.hallmark/log.json`, 21-macrostructure rotation, gates 8/20/21/32/57) — anti-repetition across many builds; we ship one page once.
- **hallmark's 21-theme catalog + custom-theme.md OKLCH construction** — theme already resolved by the locked brand.
- **hallmark's Component-scope flow and 8-state demo wrapper** — page-scope work; the 8-state *checklist* stays, the `.preview.html` artifact doesn't.
- **minimalist-ui §5 faux-OS window chrome and `<kbd>` keystroke UIs** — hallmark gate 47 bans re-drawn chrome; no keyboard-shortcut story.
- **gpt-taste §5–§6 (GSAP paradigms, horizontal accordions, dome galleries, infinite marquees)** — awards-bait effects catalog.
- **high-end-visual-design §3 archetypes, §4 Double-Bezel, §5A Fluid Island nav** — "$150k agency build" is the wrong target; we aim at *plain, not basic*.
- **All skills' Inter/Geist/Satoshi font-selection rules** — moot; Hanken Grotesk locked.
- **All skills' `picsum.photos` / logo-wall guidance** — real product screenshots, no customer logos to show.

---

## PASS 2 — imagegen/brand skills (brandkit, imagegen-frontend-web, imagegen-frontend-mobile, image-to-code, full-output-enforcement, redesign-existing-projects)

## STEAL — rules worth applying to the iBookit marketing page + brand rollout

### Section structure & narrative
- Pick the section count **out loud before writing any markup**, lock it, and check the delivered count against it at the end. (imagegen-web §19, full-output §Execution)
- Every section has exactly one job — hook / prove / teach / convert. A section that can't name its job gets cut. (imagegen-web §18)
- Use a **narrative spine** threaded through all sections instead of a feature list. For us the honest ones are *tool / precision instrument* (the front desk, calibrated) or *archive / dossier* (indexed rows, understated authority) — both fit "plain not basic". (imagegen-web §2)
- Start from the 8-section pack (hero / proof / features / product showcase / use cases / testimonial / pricing / CTA), then delete every section we can't fill with true content. (imagegen-web §15, image-to-code §33)
- Vary **section ambition**, not just content: some large and art-directed, some mini and near-empty. Uniform slabs read as generated. (imagegen-web §5)
- Keep spacing *between* sections even and controlled even while section heights vary — rhythm comes from density, not from erratic gaps. (imagegen-web §10/§12)
- Alternate density: never two dense sections back to back; a calm section between them. (image-to-code §32)
- The closing section closes — one primary CTA plus one trust cue, not a link farm. (imagegen-web §18)

### Composition variety
- **Left-text / right-image is the single most overused AI layout.** Allowed once, never as the hero default, never twice in a row. (imagegen-web §HERO BIAS, image-to-code §29)
- Assign each section a composition anchor from a real list (stacked center, top-left lead + bottom-right support, off-grid editorial offset, right-third caption, image-as-canvas) and log them; reject the set if one anchor repeats 3+ sections running. (imagegen-web §2/§18)
- Commit to **one hero scale** — giant / mid editorial / mini minimalist — decisively; don't split the difference. Mini (small mark + short statement + thin CTA + negative space) is confident restraint, not weakness, and is the right default for a recessive brand. (imagegen-web §2)
- Hero headline: 1 line ideal, 2 good, **3 maximum**. If it wraps to 4, cut words, don't add lines. (image-to-code §14)
- Hero must be clean and complete on a **small laptop viewport** — one focal point, visible CTA, no competing anchors. (image-to-code §15)
- Ban nested containers: no cards inside cards inside a big rounded section wrapper. One framing move per section. (image-to-code §16)
- Strip micro-UI clutter — pseudo-system pills, tiny status badges, decorative metadata rows, fake technical labels. Stronger typography instead. (image-to-code §17)
- **Vary CTA form** at least once across the page: primary button, ghost/outline, underlined inline link with arrow, CTA-as-caption under a visual. Secondary actions must *look* secondary (scale/weight/outline), never clones. (imagegen-web §2/§18)
- Three equal card columns is the most generic AI feature row — use a 2-column zig-zag, asymmetric grid, or variable-height layout. (redesign §Layout)
- Align shared elements across side-by-side items (titles, prices, feature-list start, buttons pinned to card bottom) so baselines form clean horizontal lines. (redesign §Layout)
- Optical, not mathematical, alignment: bottom padding usually needs slightly more than top; icons beside text need 1–2px nudges. (redesign §Layout)

### Palette discipline
- One palette across the whole page: 1 anchor, 1 supporting tone, 1 accent used sparingly, one neutral scale. Section mood shifts reuse it — **no theme swap per section**. (imagegen-web §13)
- **One accent color only.** More than one is the defect. (redesign §Color) — matches plum-used-scarcely exactly.
- Stick to one gray/neutral family and tint everything with the same hue. Never mix warm and cool neutrals. (redesign §Color)
- A lone dark section dropped into a light page reads as a copy-paste accident. For contrast, use a deeper shade of the same warm palette — commit to the dark theme wholesale or not at all. (redesign §Color)
- Tint shadows with the surface hue rather than black-at-low-opacity, and keep one consistent light direction across the page. (redesign §Color)
- Gradients only as low-chroma, palette-matched tonal grades (canvas → warm sand). Banned: mesh/rainbow, purple→blue, pink→orange, glow halos, gradient text as a shortcut for "premium". (imagegen-web §13)
- Vary background *intensity* at least twice down the scroll (lighter → richer → calmer) so the page is paced. (imagegen-web §18)
- Keep numerals in tabular figures for anything data-shaped. (redesign §Typography — validates our locked type spec)
- Body copy capped near 65 characters; use `text-wrap: balance` on headings and `pretty` on body to kill orphans. (redesign §Typography)

### Mockup & asset presentation
- Product screenshots on the page are **identity applications, not feature demos** — a crop, an app header, a single panel. Not a full fake dashboard bristling with data. (brandkit §Mockup)
- If we frame screens in a phone: one device style, one scale across the whole page, even canvas margins on all four sides, phone never touching an edge, soft controlled shadow. The frame supports the screen — **content stays the hero**. (imagegen-mobile §10)
- Media sits in fixed-aspect, repeatable frames with consistent radius logic; same-role images share proportions. (image-to-code §20)
- Never crop a detail out of a larger asset — rebuild it at the size it will be shown, or spacing and type scale distort. (image-to-code §5, imagegen-mobile §5)
- Any text over imagery gets a real readability treatment (fade-to-transparent, scrim, side mask), not raw opacity. (imagegen-mobile §18)
- If we use two or more images, make them genuinely different crops (macro detail + contextual environment), not one silhouette repeated. (imagegen-web §18)

### Completeness & output discipline
- Count the deliverables before building, re-read the brief before shipping, compare counts. Missing sections get added, not excused. (full-output §Execution)
- Hard-banned in output: `// ...`, "rest of code", "for brevity", skeletons where the request was a full implementation. (full-output §Banned)
- Pre-ship state checklist: hover, active/pressed feedback, visible focus ring, 200–300ms transitions, real destinations (no `href="#"`), current-page nav state, `min-height: 100dvh` not `100vh`. (redesign §Interactivity)
- Ship the things AI omits: favicon, `<title>`/description/`og:image`, skip-to-content link, alt text, semantic landmarks, 404, privacy + terms links, real form validation with inline errors (never `alert()`). (redesign §Strategic Omissions, §Code Quality)
- Animate `transform`/`opacity` only; staggered entry with slight delays, never mount everything at once. (redesign §Motion)
- Max-width container ~1200–1440px so content doesn't stretch edge-to-edge. (redesign §Layout)

### Brand-system presentation
- **One strong idea per surface.** Not every panel is loud; a page has rhythm — quiet, functional, emotional, technical, detailed. (brandkit §Board Composition)
- Premium detail rewards a second look, it doesn't announce itself: thin rules, precise alignment marks, one highlighted word, one accent chip. Do not overuse. (brandkit §Premium Detail)
- Pick exactly **one "second-read" moment** for the whole page — one oversized numeral, one narrow editorial side-rail, one asymmetric bleed — and only if it aids scan order. (imagegen-web §2)
- Taglines are short and specific, never inspirational fluff. (brandkit §Tagline)
- When the brief names a region, steer palette and typographic temperament to match — Mexico-first and es-MX are a *design* input, not just a translation pass. (imagegen-web §18)
- Extract *rhythm, spacing, density, accent logic* from any reference — never its composition or assets. References are a quality bar, not a template. (brandkit §Reference Usage)

## BAN — anti-patterns to avoid, including the skills' own bad advice

- **Copy slop.** es-MX list: no *impulsa / potencia / revoluciona / lleva tu negocio al siguiente nivel / solución integral / la plataforma todo-en-uno / transforma*. Plain, specific, tú-register. No exclamation marks in success copy, no "¡Ups!" errors, no Title Case headers — sentence case. (imagegen-web §8, redesign §Content)
- **Fabricated proof.** No invented gym names, no fake testimonials with stock avatars, no logo trust-bar of businesses that aren't customers, no three-column KPI strip (99% / ∞ / +50%). One real operator; say true things or ship no proof section. (imagegen-web §8, redesign §Content)
- **Placeholder-photo padding.** redesign tells you to fill "empty flat sections" with `picsum.photos` background imagery. Refuse — stock atmosphere behind text fights a recessive warm identity. Whitespace is the answer.
- **Texture-and-gradient maximalism.** redesign's "flat design is sterile → add noise/grain/mesh gradients" and brandkit's halftone/CRT/scanline vocabulary are wrong for us. At most a whisper of grain on the warm canvas; mesh gradients never.
- **Font substitution.** redesign orders Geist/Outfit/Cabinet/Satoshi swaps. Hanken Grotesk locked — ignore entirely.
- **Techy surface tricks.** True glassmorphism, spotlight/cursor-lit borders, variable-font scroll animation, text-mask video reveals, split-screen opposite-direction scroll, inertia scroll hijacking. All fail "modern not techy"; all punish mid-range Android. (redesign §Upgrade Techniques)
- **Dark-charcoal-by-default.** brandkit's reference DNA presumes a dark cinematic canvas; our light canvas is #FAF8F4. Don't inherit its mood.
- **Cool-tinted darks.** dark navy fights the warm dark canvas #16130E.
- **Mandatory full-bleed atmosphere.** imagegen-web §18 rejects any set with no full-bleed background — its own minimalist-brief escape hatch is the one that applies to us. Don't manufacture an atmosphere section.
- **Creativity-for-its-own-sake.** "actively increase at least 3 creativity axes" / "don't force minimalism" push variance as a quota. Restraint *is* the design; variance must earn its place per section.
- **Novelty-chasing iconography.** "Use Phosphor instead of Lucide" optimizes for not-looking-like-AI, not clarity. Keep the real rule (one stroke weight, consistent metrics); a bespoke icon set is scope creep.
- **Completeness as an excuse to bloat.** full-output governs *not truncating what was asked for* — not a licence to add sections nobody asked for. keep-it-lean wins that collision.
- **Layout slop generally:** endless centered sections, cloned card rows, 3-tower pricing distinguished only by height, accordion FAQ, 3-card testimonial carousel with dots, 4-column footer link farm, infinite logo marquee. (redesign §Component Patterns, imagegen-web §8)

## IGNORE

- **brandkit — logo concept methods:** the 3×3 mark is locked; nothing to concept.
- **brandkit — visual modes taxonomy + prompt template:** an image-prompt generator for identity boards already shipped.
- **imagegen-web — §5 image count / §19 response behavior / one-image-per-section mandate:** image-pipeline mechanics; we build in HTML/CSS.
- **image-to-code — §2–§7, §10–§11 (image-first workflow):** generate-then-analyze premise. Residue already stolen: write design decisions down explicitly before coding, then don't drift (§26/§27).
- **imagegen-mobile — platform mode, safe areas, navigation, onboarding, category bias:** app-screen concerns; category biases contradict vertical-neutral. Only §10 mockup framing and §18 image-behind-text survive.
- **redesign — Scan → Diagnose sequence:** greenfield, nothing to audit. Audit lists valuable as a **pre-ship checklist**, not an intake process.
- **full-output — token-limit split protocol:** one page is not multi-turn output; scope-lock and banned-placeholder rules are the parts that carry.
