# iBookit house brand — Claude Design re-skin brief

iBookit's house brand is the default a client with no brand of their own wears: **recessive
not invisible · warm not playful · plain not basic · modern not techy** — it must read
deliberate, but never louder than a client's own brand. Everything below derives from the
locked identity (`docs/brand/03-visual-identity/IDENTITY.md`): warm paper neutrals, one
scarce plum accent, Hanken Grotesk.

## 1 · The 33 tokens, light + dark

Contract names are historical and stay verbatim (`yellow*` has meant "the accent family"
since the first brand): here **`yellow` = plum**. Neutrals are ink-over-canvas mixes of the
locked anchors; the accent family is a plum ramp; semantic green/red/amber are their own
families, tuned to pass 4.5:1 as text on their `-soft` chips — they never lean plum.

```css
:root,
.light {
  /* Superficies — warm paper. canvas = page, surface = cards, sunk = recessed wells,
     line/line-soft = hairlines. All mixes of ink #201B14 over canvas #FAF8F4. */
  --canvas: #faf8f4;
  --surface: #ffffff;
  --sunk: #eceae5;
  --line: #e4e2de;
  --line-soft: #f0eeea;

  /* Acento — the `yellow*` family IS the plum ramp (anchor #8A4A6C).
     yellow = fill (buttons, active states) · gold = accent TEXT (plum+25% ink) ·
     dim = quiet strokes · soft/edge = tint wash + border · press = pressed fill ·
     yellow-fg = text ON the plum fill · core = the mark's deep band. */
  --yellow: #8a4a6c;
  --gold: #703e56;
  --yellow-dim: #ae8298;
  --yellow-soft: rgba(138, 74, 108, 0.12);
  --yellow-edge: rgba(138, 74, 108, 0.38);
  --press-yellow: #7f4563;
  --yellow-fg: #ffffff;
  --yellow-core: #7a435f;

  /* Plata — secondary neutral emphasis (stat figures, quiet icons): a muted→ink ramp. */
  --silver: #5b5248;
  --silver-dim: #a19b93;
  --silver-core: #4c443b;

  /* Texto — fg/muted are the locked ink/tenue anchors; muted-soft = disabled. */
  --fg: #201b14;
  --muted: #6b6257;
  --muted-soft: #bab5ad;

  /* Estados semánticos — vigente/vencido/por-renovar. Own families, never plum;
     each solid passes 4.5:1 as text on its -soft chip (measured in §5). */
  --green: #116c38;
  --red: #b7332c;
  --warning: #8f5408;
  --green-soft: rgba(17, 108, 56, 0.13);
  --red-soft: rgba(183, 51, 44, 0.12);
  --warning-soft: rgba(143, 84, 8, 0.13);

  /* WhatsApp preview — authentic WhatsApp colors, identical in every brand. */
  --wa-bubble: #d9fdd3;
  --wa-bubble-fg: #111b21;
  --wa-bubble-meta: rgba(17, 27, 33, 0.5);

  /* Overlays — ink is the fixed near-black (same in dark: text on fixed-light cards);
     glass = translucent surface, scrim = ink veil, tab-bg = mobile tab bar. */
  --ink: #201b14;
  --glass: rgba(255, 255, 255, 0.78);
  --scrim: rgba(32, 27, 20, 0.44);
  --tab-bg: #ffffff;

  --backdrop: #eae7e3;
}

/* Same roles on the dark anchors (canvas #16130E, ink #F2EDE5, plum #C287A8).
   yellow-fg FLIPS to ink: white on the dark plum is 2.87:1 — a fail. */
.dark {
  --canvas: #16130e;
  --surface: #1e1a14;
  --sunk: #0d0b08;
  --line: #2c2924;
  --line-soft: #211e19;

  --yellow: #c287a8;
  --gold: #c287a8;
  --yellow-dim: #755363;
  --yellow-soft: rgba(194, 135, 168, 0.14);
  --yellow-edge: rgba(194, 135, 168, 0.4);
  --press-yellow: #c893af;
  --yellow-fg: #201b14;
  --yellow-core: #976a82;

  --silver: #c7bdb1;
  --silver-dim: #6d655a;
  --silver-core: #918779;

  --fg: #f2ede5;
  --muted: #a79b8c;
  --muted-soft: #504940;

  --green: #5cd47a;
  --red: #ff5a5a;
  --warning: #f59e0b;
  --green-soft: rgba(92, 212, 122, 0.14);
  --red-soft: rgba(255, 90, 90, 0.14);
  --warning-soft: rgba(245, 158, 11, 0.14);

  --wa-bubble: #005c4b;
  --wa-bubble-fg: #e9edef;
  --wa-bubble-meta: rgba(233, 237, 239, 0.6);

  --ink: #201b14;
  --glass: rgba(30, 26, 20, 0.72);
  --scrim: rgba(0, 0, 0, 0.64);
  --tab-bg: #16130e;

  --backdrop: #0a0906;
}
```

## 2 · Type

```html
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600&display=swap" rel="stylesheet">
```

Hanken Grotesk everywhere. **600** for display, headings, buttons, the wordmark; **400**
for body. Scale: display 28px / 1.15 · title 20px / 1.25 · body 15px / 1.5 · caption
12.5px / 1.4 · overline 11px / 600 / +0.08em tracking (labels like "ADMINISTRADOR").
Every price, vigencia, hora and folio sets `font-variant-numeric: tabular-nums`.
Wordmark: **"iBookit"** — 600, letter-spacing −0.02em, the i/B seam always legible;
never "ibookit", never all-caps.

## 3 · The mark

A quiet 3×3 grid of outlined cells — the week's schedule — and one filled plum cell:
**tu lugar apartado**. The filled cell is the only one with a squared top-left corner.
Tokenized: quiet cells ride `currentColor` (set `color` to the scheme's ink: `#201B14`
light / `#F2EDE5` dark), the claimed cell rides `var(--yellow)`. Recolor rule: only the
accent fill ever swaps; quiet cells always take the scheme's ink.

```html
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="iBookit">
  <g fill="none" stroke="currentColor" stroke-width="2.5">
    <rect x="6" y="6" width="12" height="12" rx="3"/>
    <rect x="26" y="6" width="12" height="12" rx="3"/>
    <rect x="46" y="6" width="12" height="12" rx="3"/>
    <rect x="6" y="26" width="12" height="12" rx="3"/>
    <rect x="26" y="26" width="12" height="12" rx="3"/>
    <rect x="6" y="46" width="12" height="12" rx="3"/>
    <rect x="26" y="46" width="12" height="12" rx="3"/>
    <rect x="46" y="46" width="12" height="12" rx="3"/>
  </g>
  <path fill="var(--yellow, #8A4A6C)" d="M45.5 25.5H54.75A3.75 3.75 0 0 1 58.5 29.25V34.75A3.75 3.75 0 0 1 54.75 38.5H49.25A3.75 3.75 0 0 1 45.5 34.75V25.5Z"/>
</svg>
```

Lockup = the mark beside the wordmark, mark height ≈ the wordmark's cap-to-descender box:

```html
<span style="display:inline-flex; align-items:center; gap:12px; color:var(--fg)">
  <!-- the mark SVG above, 40×40 -->
  <span style="font:600 32px/1 'Hanken Grotesk',sans-serif; letter-spacing:-0.02em">iBookit</span>
</span>
```

Sizes: login hero 72–96px, header lockup mark 32–40px, favicon uses `appicon.svg` (plum
field, canvas-light cells). **Below 20px the grid degrades — always pair with the wordmark.**

**Animated login mark:** `docs/brand/06-house-theme/login-mark.html` is the working demo +
liftable snippet (grid settles, then the plum cell claims its place; ≤1100 ms, one shot,
reduced-motion safe). Per the registry's `loginAnimation` contract, the **admin** login
passes the tagline `"ADMINISTRADOR"`; the **client's** auth screens pass none and render no
tagline line at all.

## 4 · What changes in your board (RED → iBookit)

Map by role, not by hex — wherever the board uses RED's crimson/cream in a role, swap the
role's new value:

| In the board today (RED) | Role / token | iBookit light | iBookit dark |
|---|---|---|---|
| Crimson fills — primary buttons, active states | `--yellow` | `#8a4a6c` | `#c287a8` |
| Deep-crimson accent text / icons | `--gold` | `#703e56` | `#c287a8` |
| Crimson tint washes + tinted borders | `--yellow-soft` / `--yellow-edge` | plum rgba above | plum rgba above |
| White text on crimson buttons | `--yellow-fg` | `#ffffff` | `#201b14` (flips!) |
| Cream page background | `--canvas` | `#faf8f4` | `#16130e` |
| Cards / sheets | `--surface` | `#ffffff` | `#1e1a14` |
| Body text | `--fg` | `#201b14` | `#f2ede5` |
| Status chips (vigente/vencido/por renovar) | `--green` / `--red` / `--warning` + `-soft` | §1 values | §1 values |
| RED wordmark + logo | iBookit lockup (§3) | — | — |
| RED's typeface | Hanken Grotesk 600/400, tabular-nums on numbers | — | — |

RED is dark-only; iBookit is light-first with a first-class dark scheme — build both.

## 5 · Contrast (measured, WCAG 2.x)

Every `*-soft` composite is measured at its rgba alpha over **canvas** (the worst case;
over surface every ratio is equal or better). Bars/fills with no text on them (e.g. the
occupancy bar's `--warning` fill) are graphics and clear 3:1 trivially.

**Light**

| Pair | Ratio | Bar |
|---|---|---|
| `fg` #201b14 on `canvas` | **16.12** | ≥7 ✓ |
| `fg` on `surface` | **17.10** | ≥7 ✓ |
| `muted` #6b6257 on `canvas` | **5.64** | ≥4.5 ✓ |
| `muted` on `surface` | **5.98** | ≥4.5 ✓ |
| `yellow-fg` #ffffff on `yellow` #8a4a6c | **6.41** | ≥4.5 ✓ |
| `yellow` on `canvas` (accent text/icon) | **6.04** | ≥4.5 ✓ |
| `gold` #703e56 on `canvas` | **7.88** | ≥4.5 ✓ |
| `silver` #5b5248 on `canvas` | **7.21** | ≥4.5 ✓ |
| `yellow` on `yellow-soft` (comp `#ede3e4`) | **5.10** | ≥4.5 ✓ |
| `green` #116c38 on `green-soft` (comp `#dce6dc`) | **5.08** | ≥4.5 ✓ |
| `red` #b7332c on `red-soft` (comp `#f2e0dc`) | **4.67** | ≥4.5 ✓ |
| `warning` #8f5408 on `warning-soft` (comp `#ece3d5`) | **4.80** | ≥4.5 ✓ |
| `green` / `red` / `warning` on `canvas` | **6.14 / 5.62 / 5.76** | ≥4.5 ✓ |
| `wa-bubble-fg` on `wa-bubble` | **15.75** | ≥4.5 ✓ |

**Dark**

| Pair | Ratio | Bar |
|---|---|---|
| `fg` #f2ede5 on `canvas` | **15.90** | ≥7 ✓ |
| `fg` on `surface` | **14.86** | ≥7 ✓ |
| `muted` #a79b8c on `canvas` | **6.80** | ≥4.5 ✓ |
| `muted` on `surface` | **6.36** | ≥4.5 ✓ |
| `yellow-fg` #201b14 on `yellow` #c287a8 | **5.96** | ≥4.5 ✓ (white would be 2.87 ✗ — hence the flip) |
| `yellow` on `canvas` (accent text/icon) | **6.46** | ≥4.5 ✓ |
| `silver` #c7bdb1 on `canvas` | **10.01** | ≥4.5 ✓ |
| `yellow` on `yellow-soft` (comp `#2e2324`) | **5.30** | ≥4.5 ✓ |
| `green` #5cd47a on `green-soft` (comp `#202e1d`) | **7.59** | ≥4.5 ✓ |
| `red` #ff5a5a on `red-soft` (comp `#371d19` / `#3e231e` on surface) | **5.07 / 4.69** | ≥4.5 ✓ |
| `warning` #f59e0b on `warning-soft` (comp `#35260e`) | **6.81** | ≥4.5 ✓ |
| `green` / `red` / `warning` on `canvas` | **9.84 / 6.05 / 8.63** | ≥4.5 ✓ |
| `wa-bubble-fg` on `wa-bubble` | **6.77** | ≥4.5 ✓ |
