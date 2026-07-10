# RED Client App — Design-Fidelity & Prod-Blocker Remediation Plan

**Date:** 2026-07-06 · **Owner:** Aaron · **Status:** ready for a fresh execution session
**Trigger:** the Phase-6 #63 exit-gate walkthrough surfaced that the deployed RED client "matches nothing" in the approved mock.
**Companion docs:** `2026-07-06-red-brand-animation-cross-app.md` (the neon-logo + cross-app animation structure) · evidence log `docs/runbooks/hitl-63-phase6-exit-gate.md`.
**Audit (2026-07-06):** independently verified by a 34-agent adversarial pass (code + mock + live DB). Diagnosis confirmed (≈115/122 claims, 0 substantive refutations); this revision folds in the audit's completeness fixes — fonts slice, mock→contract crosswalk, amber-is-a-contract-change, Slice-9 interleave, `restablecer` row, admin `HERO_OFFSET`, and spec nits.
**Source of truth (the design we must ship):** `C:\Users\Aaron\Desktop\Pending\Red-1.0 Client App Frontend Design\RED-1.0-Design\index.html` (2527-line single-file mock; screens are DOM sections toggled by JS).

---

## 0. TL;DR

The integration **landed**. "Nothing matches" was a *stack* of small config/code defects plus testing the wrong gym — not a missing build. There are two classes of work:

- **(A) Fast unblocks** — config + a few code changes that restore the broken member journey **and** flip most of the look. The highest-leverage change: **activate dark mode** — RED's dark tokens already ship but nothing puts `.dark` on `<html>`, so every screen paints RED's *light* (cream) scheme; one seam flips them all to near-black neon.
- **(B) A real design-fidelity build** — the neon **ring logo** (currently a chevron placeholder), ~12 missing **animations**, the RED **marketing voice/copy**, and per-screen **dark-neon styling**. This is genuine work, quantified per-screen below.

Every screen is already **functionally built and usually data-wired *beyond* the mock** (real anon catalog, real booking RPCs, captcha, `.ics`, RLS-scoped reads). The gap is **skin, not structure.**

---

## 1. Provenance

Produced from two adversarially-verified multi-agent investigations (evidence = live `curl`, Supabase DB + auth logs, and code reads):
- **5-bug triage** (`phase6-exit-gate-triage`) — brand paint, auth redirect, entrar, turnstile, nav. Brand + auth root causes **CONFIRMED** on re-verification.
- **Design-fidelity audit** (`red-client-design-fidelity-audit`, 14 agents) — full mock design-system extraction, per-screen mock-vs-impl audit, and the config-vs-build determination (**CONFIRMED**).

**Reconciliation note:** two per-screen agents speculated the host resolves to the neutral `base` brand (indigo). The brand-arch agent and the triage brand agent both **disproved this** via curl (served tokens are RED's crimson `#dc2626` + RED's `#faf6f6`/`#0c0808`, not base `#f6f6f7`/indigo) and DB (`gym.slug='red' → brand_module_id='red'`). **It is RED, painted in RED's light scheme, with RED's current double-chevron logo.** Treat any "renders base" phrasing in raw agent output as superseded.

---

## 2. Confirmed root causes (runtime blockers)

| # | Symptom | Confirmed root cause | Fix | Where |
|---|---------|----------------------|-----|-------|
| **B1** | Whole app light/cream, "nothing matches" | Dark mode never activated. `tokensToCss` emits `:root,.light{…}` + `.dark{…}`; `layout.tsx:42` `<html lang="es-MX">` has no `.dark`, no `prefers-color-scheme`. RED's dark tokens ship but stay dormant. Brand resolution + tokens are **correct**. | Activate dark (Slice 1) | code, ~S, app-wide |
| **B2** | Chevron logo, generic tagline | RED module ships a **double-chevron** mark + generic copy; the mock's neon **ring** + "CON BENEFICIOS DE LUZ ROJA" were never built. | Slices 5–7 (build) | `packages/brand/src/red/*` |
| **B3** | "No pudimos verificar…" on registro | Submit not gated on Turnstile completion. Test keys auto-passed instantly; the real **Managed** widget takes a beat → submit before token exists → empty `cf-turnstile-response` → verify fails. Email came from an attempt where the token *was* ready. | Slice 3 (gate submit) | code |
| **B4** | Confirm link → `localhost:3000/?code=` | **Supabase Site URL = `localhost:3000`** + prod `/auth/confirm` not allowlisted → GoTrue discards the correct per-host `emailRedirectTo` and falls back to Site-URL root. Verified in auth logs (signup came from a Vercel IP = prod). | Slice 0 (config) | **owner**, Supabase dashboard |
| **B5** | ENTRAR "does nothing" | Pre-confirm it failed `email_not_confirmed` (masked as "wrong password"); **post-confirm login SUCCEEDS** (auth logs: 4× HTTP 200) but redirects to `/` (public landing, no signed-in state) → looks dead. | Slice 2 (redirect → `/reservar`) | code |
| **B6** | No back from registro; "can't see pages" | registro lacks the "Volver al inicio" link its sibling `/entrar` has. "Can't see pages" is partly by-design: public pages are open; the members' area is correctly auth-gated. | Slice 4 | code, minor |
| **B7 (latent)** | Sessions will silently drop | `proxy.ts` never refreshes the Supabase session despite `supabase.ts:17-19` asserting "proxy.ts owns session refresh" (a second comment repeats the false assumption at `:39`). Fine at first login; breaks on access-token expiry (rotation is active per auth logs). | Slice 2 | code |

**The "wrong gym" reveal:** on the live host, `?gym=red-demo` is **inert** — `resolveTenant` is host-wins (`resolve-tenant.ts:53-62`), so `red-2-0-client.vercel.app/?gym=red-demo` served the **`red`** gym, which has **0 sessions this week** ("Hoy no hay clases"). `red-demo` has 3 sessions this week but **no prod domain**. See Slice 0 for how to actually test it.

---

## 3. The RED design system (ship target)

Under brand-is-DATA (ADR-0012) this is the **RED brand module's** content: token set + `RedLogo`/`RedMark` + the animation module. The neutral `base` module stays light.

### 3.1 Palette (exact, from the mock `:root`)
Dark neon on near-black. **Do not collapse the three reds** — that kills the neon depth. ⚠️ **The names below are the mock's CSS vars, not the shipped contract keys** — read the crosswalk after the table before coding any of them.

| token | value | role |
|---|---|---|
| `--accent` | `#b5161c` | solid crimson: CTAs, active states, focus borders, accent text/icons |
| `--on-accent` | `#fafafa` | text/icon on accent |
| `--canvas` | `#050505` | deepest backdrop |
| `--bg` | `#0a0a0a` | app body (mock `<body>` `#0d0d0f`) |
| `--bg2` | `#0e0e0e` | recessed panels (ticket stub, time column) |
| `--surface` | `#121212` | cards |
| `--ink` | `#fafafa` | primary text |
| `--gray1/2/3` | `#c5c5c5` / `#7a7a7a` / `#5e5e5e` | secondary / muted / faint |
| `--line` / `--line2` | `#1f1f1f` / `#262626` | hairlines / field underlines |
| `--danger` | `#e8902a` | **AMBER** warning (few/full/cancel) — deliberately *not* a second red |

**Three reds:** solid fill `#b5161c` · tint base `rgb(239,43,26)=#ef2b1a` (almost exclusively via `rgba()` for tint bg ~.13 / border ~.4 — two solid-hex exceptions are decorative furniture: the demo accent-swatch picker + one confetti-burst color) · **glow** reds `#ff2c19`/`#cc0f00` (idle) → `#ff3a26`/`#e21500` (peak) + drop-shadow stack `#d92b1f`/`#b5161c`/`#7e0d10`. Terracotta `rgb(217,84,61)` for FULL/cancel tints (text still amber).
**Ember bar vars:** `--rp-fill` (accent / `.s-full` `#c98a14` amber / `.s-finished` `#332f29` dead), `--rp-glow*` pairs, `--rp-step` 30ms pip stagger, `--card-i` desync.

**Mock var → contract key crosswalk.** The `@gym/ui` contract (`packages/brand/src/tokens.ts:8-44`, 28 keys) is filled by *role name*, so the palette above must be re-expressed against it before coding:

| mock var | contract key | note |
|---|---|---|
| `--accent` | `yellow` | the FILL-accent key carries crimson (`red/tokens.ts` `yellow:#f04444` dark) |
| `--bg` (app body) | `canvas` | |
| `--surface` (cards) | `surface` | |
| `--bg2` (recessed) | `sunk` | |
| `--canvas` (deepest) | `backdrop` / `sunk` | **4 mock bg tiers → 3 contract tiers** — a lossy collapse; pick the mapping deliberately |
| `--ink` (primary *light* text `#fafafa`) | `fg` | **FALSE FRIEND:** the contract has a key literally named `ink`, but it is `#0a0a0a` (near-*black*). Map `--ink` → `fg`, never `ink`. |
| `--gray1/2/3` | `silver` / `muted` / `muted-soft` | secondary / muted / faint |
| `--line` / `--line2` | `line` / `line-soft` | `line-soft` also does non-field hairlines (ticket dividers, perforations), not only field underlines |
| `--danger` (amber) | — **no channel** | warnings borrow `red` (error) today — see §7.4 |
| glow reds · ember `--rp-*` | — **no channel** | Slice 6 |

Three of these are **contract gaps, not value retunes**: (a) amber `--danger` has no key (adding it = a new `TOKEN_KEYS` entry + a fill in *every* brand + an override-schema change — §7.4); (b) the glow/drop-shadow reds have no channel; (c) the ember `--rp-*` vars have no channel. (b)/(c) are Slice 6.

> Today's RED **dark** tokens (`red/tokens.ts:50-86`: canvas `#0c0808`, surface `#161010`, accent `#f04444`) are *close but not pixel-matched* to the mock (`#050505`/`#121212`/`#b5161c`). Decide: retune RED dark tokens to the mock's exact values, or accept the near-match. Recommend **retune to mock** for fidelity. This "retune" covers only the **existing** contract keys (free — value edits in `red/tokens.ts`); the amber `--danger`, glow, and ember `--rp-*` channels in the crosswalk above are separate **contract extensions**, not part of this decision (§7.4 + Slice 6).

### 3.2 Typography
**Outfit** (300–800, UI) + **JetBrains Mono** (400/500/700, data/badges/eyebrows) — self-host WOFF2 (CSP). Signature = **tension between wide-tracked tiny uppercase labels** (8–11px → 1.0–2.6px letter-spacing, uppercase) **and tight-tracked heavy display numerals** (52/30px, weight 800, −1 to −2px). `tabular-nums` on every mutable number.

### 3.3 The 16 animations
| name | animates |
|---|---|
| `ringDraw` | **logo ring ignition** — two arcs `stroke-dashoffset 1410→0`, ringtop @.15s / ringbot @.6s |
| `redFlick` | **neon flicker** turn-on of R/E/D letters (+ roster pips), staggered 1.18/1.46/1.72s |
| `redBreathe` | idle logo glow — 3-layer drop-shadow pulse, 4.2s, start 2.4s, ∞ |
| `copyNeonOn` / `copyDashDraw` / `copyTextBreathe` / `copyDashBreathe` | tagline neon turn-on + flanking rules draw-in + their idle breathe |
| `riseIn` | landing content cascade, `translateY(16px)→0`, staggered 1.5→2.4s |
| `pipBreathe` / `mbSweep` / `mbBreathe` | **ember data-bars** — resting glow breathe / one-shot fill sweep / plan-bar breathe |
| `ckDraw` / `ckGlow` / `rvcBurst` | confirmed-check ring+tick draw / halo / confetti (booking success) |
| `cfpop` | confirmada check pop-in (overshoot) |
| `screenIn` | screen/route entry |

**Choreography:** landing = `ringDraw → redFlick → copyNeonOn/copyDashDraw → riseIn` then all settle into 4.2s breathe loops phase-anchored at 2.4s. **Already ported:** only the booking-confirm morph (`globals.css:46-142`) — the mock's `ckDraw`/`ckGlow` were **renamed** to `rvcDraw`/`rvcGlow` in the port (only `rvcBurst` kept its mock name), so grep `rvc*`, not `ck*`. **Missing:** the logo ignition, all neon-copy, and all ember-bar animations (~12). Detailed rebuild spec → **Doc 2**.

### 3.4 Component patterns
Solid-crimson `.btn-primary` bar (not a gradient); `.ghost`; **perforated ticket cards** (dashed perf + circular notches); **underline form fields** (transparent, 1.5px bottom-border, accent-on-focus); bottom **sheets** + right-slide **profile page** + left **drawer** (burger→X); **toast** (3px accent left-border); **ember data-bars** (glow on the *track* so `overflow:hidden` can't clip it). Full spec in the audit output (`tasks/wopoa71wy.output` → `designSystem.fullSpecMarkdown`).

### 3.5 Motion + reduced-motion
House easing `cubic-bezier(.4,0,.2,1)` ~.42s (sheets .34s); entrances `cubic-bezier(.2,.7,.3,1)`; success overshoot `cubic-bezier(.2,.8,.2,1.2)`. The mock guards **only** landing + data-bars for `prefers-reduced-motion`, but the repo already ships a **universal `*` collapse** (`packages/ui/src/motion.css:64-72`) — so don't add per-component media queries. Instead, give every logo/check/slide animation a `forwards`/`both` fill so the global collapse lands on the **fully-lit / final state** (ring fully drawn, check filled, no confetti), not a half-played frame. (This supersedes Doc 2 §4's identical guidance — they agree.)

---

## 4. Per-screen gap inventory

All screens `implemented = partial`: structure + data are there; the blocker on every one is the **app-wide theme** (fixed once in Slice 1), plus screen-local fidelity. Effort excludes the shared theme fix (Slice 1) **and** the once-built neon-ring/ignition asset (Slices 5–6) — so the **L** on landing/entrar/registro is mostly that shared asset; their *screen-local* effort (wiring + composition) is ~**M** once it lands.

| Screen | Route | Headline gaps beyond theme | Effort |
|---|---|---|---|
| **Landing (comercial)** | `/` | No hero animation (needs neon-ring ignition); chevron logo; tagline "Reserva. Entrena. Avanza." vs "Con beneficios de luz roja"; no entrance cascade; footer "— estudio funcional" dropped | **L** |
| **Precios** | `/precios` | Per-plan **note** field unmodeled (needs `paquetes` column); 3 CTA labels collapsed to 2; hero tagline + "Ver horarios" CTA missing; "incluye" rows hardcoded 3 (coaches/horario dropped); h1/badge typography | **M** |
| **Nosotros** | `/nosotros` | "La fragua" story + pull-quote absent (no `about_story` table); forge/RED brand voice lost; hero centered+sentence-case vs left+uppercase-industrial; CTAs retarget booking→registro | **L** |
| **Contacto** | `/contacto` | Strongest screen. Only: hours "· Abierto Lun–Sáb" label + danger-red closed row + "Primera clase 05:30…" line; square vs circle channel badges | **S** |
| **Entrar** | `/entrar` | Neon-ring logo animation (has chevron ember instead); hero composition (form bottom-pinned over full-screen anim vs mock's top-down flow); missing eyebrow/title/desc, "o" divider, ghost alt button, footer CTA + tagline | **L** |
| **Registro** | `/registro` | Same logo/animation/hero-composition as entrar; missing top back-nav + "Ya tengo cuenta"; copy drifts ("Únete a RED", "de RED", tagline); **+ the B3 turnstile gating fix** | **L** |
| **Restablecer** | `/restablecer` | Inherits the entrar/registro auth-hero (neon-ring + composition) → no separate build; has **zero** back-nav today (not even the "Volver a entrar" its siblings carry). It **is** exit-gate screen #7 (runbook AC1), so it needs its own sign-off even though its fidelity rides Slices 5/6/8 | **S** (rides 5/6/8) |
| **Reservar (week)** | `/reservar` | Ember-ignition occupancy bar is a flat track (major); confirmed-sheet offers 1 of 3 actions ("Ver mis reservas"/"Añadir al calendario" dropped); ticket perforation/notches + "Tu favorita" pill; two-line title | **M** |
| **Clase detalle** | `/clase/[id]` | Roster **neon pips** flat (major — the screen's signature); "Qué trabajamos" label→value 2-column collapsed (needs `class_type_workblock.value`); danger renders red not amber | **M** |
| **Confirmada** | `/confirmada/[id]` | "Ver mis reservas" links to `/reservar` (browser) not the reservas overlay (major — needs a deep-link); check is filled circle vs square outline + no `cfpop`; title not uppercased; ticket notches | **M** |
| **Mis reservas + Membresía + Perfil** | overlay in `/reservar` (`PerfilOverlay`) | Plan **depletion bar** flat (needs ember `mbSweep/mbBreathe`); footer brand lines dropped; ticket notches | **M** |
| **Global chrome** (header + drawer + layout) | `layout.tsx` + `public-header.tsx` | Chevron logo → neon-ring mark; header is sticky/bordered/blurred vs mock's transparent floating; drawer/nav/copy otherwise faithful | **M** |

> **One shared root cause behind three "per-screen" rows:** the amber-`danger` (clase-detalle), roster-**pip** glow (clase-detalle), and ember-**bar** glow (reservar, perfil) gaps are all the *same* missing token-channel problem (§3.1 crosswalk (b)/(c) + §7.4), not independent screen fixes — resolve the channel once in Slice 6 and all three inherit it. Likewise the occupancy bar is a **segmentation** change (mock uses glowing pips, impl uses one continuous fill), not just "add a glow."

**Kept as strengths (do NOT "fix" back to the mock):** real anon-catalog data-wiring everywhere; real booking RPCs + RLS scoping; Turnstile captcha; real `.ics` download; interactive favorita; real forgot-password flow; conditional/empty states; the `/registro` funnel (register-before-reserve, documented); `"gimnasio"` neutral voice (Phase-4 #35 decision) — but re-add the *neon tagline* which is brand identity, not Forge voice.

---

## 5. Brand architecture verdict — config **and** build

`redModuleState = **partial**` (confirmed). The host→brand→token **plumbing is correct and needs no change** (`resolve-tenant.ts:72-91` → `x-brand` → `lib/brand.ts:14-19` → `brandCss` → `layout.tsx:39-44` injects `:root,.light` + `.dark`). Two seams are missing:

| Aspect | State | Meaning |
|---|---|---|
| Dark token palette | **implemented-not-resolved** | Built + served; just never activated → **config/architecture fix** |
| Neon ring logo | **not-implemented** | Chevron placeholder shipped → **build** |
| Ignition / ~12 animations | **partial** | Only booking-morph ported → **build** |
| RED marketing copy | **not-implemented** | Generic taglines; "luz roja" never coded → **build + decision** |
| Per-screen dark-neon layout | **partial** | Functional, but generic light Tailwind chrome → **build (restyle)** |

**Correct architecture:** add a `defaultScheme: 'light' | 'dark'` to the `BrandModule` type (`registry.ts`), set `'dark'` on the RED entry, and have `layout.tsx` stamp `<html className={brand.defaultScheme === 'dark' ? 'dark' : undefined}>` — this flips the **already-served** neon `.dark` block on with **zero DB change, no FOUC** (SSR-stamped). (Alternative: make dark-only brands emit their dark palette as `:root` directly.) Then **build** the mock-fidelity content into `@gym/brand` + the client screens.

---

## 6. Sequenced remediation slices

Ordered so each *mostly* unblocks the next — with two flagged exceptions: **Slice 1b (fonts)** is a foundational prerequisite for §3.2 fidelity, and **Slice 9's data touches lead Slices 7–8** (prerequisites, not a finale). Owner-only steps flagged.

- **Slice 0 — Config unblock** *(owner; minutes)*
  1. **Supabase Auth → URL Configuration** (project `hjppxawglmukfvsgmcog`): set **Site URL** = `https://red-2-0-client.vercel.app`; add **Redirect URLs**: `https://red-2-0-client.vercel.app/**`, `https://forge-red-2-0-client.vercel.app/**`, `http://localhost:3000/**`. (Fixes B4 → unblocks B5 → unblocks the whole authenticated journey.)
  2. **Reach red-demo for testing:** either add a `gym_domain` row mapping a hostname → red-demo's `gym_id`, **or** test red-demo on a host with *no* `gym_domain` mapping (so `?gym=` engages), **or** seed sessions on `red`. (Otherwise you keep testing `red` with 0 sessions.)
  3. *(Optional)* rotate the Turnstile secret (it touched a tracked file + this session; never committed) — same sitekey, so no code change.
- **Slice 1 — Activate dark mode** *(code, ~S — highest leverage)*: `BrandModule.defaultScheme` + `layout.tsx` `.dark` stamp. Verify no-FOUC via `curl` (`<html class="dark">` in SSR) and that every screen flips to near-black. Optionally retune RED dark tokens to the mock's exact hex (§3.1). *(Clean flip confirmed: screens use semantic token classes, not `dark:` utilities — ~0 in the client — so the value swap repaints them all with no per-screen `dark:` breakage.)*
- **Slice 1b — Self-host the type system** *(build, ~S — foundational prerequisite)*: the design's signature typography is **unshipped** — the client renders in `system-ui` (`globals.css:165`), with no `@font-face`/`next/font` anywhere. Self-host **Outfit** (300–800) + **JetBrains Mono** (400/500/700) as WOFF2 under CSP and wire `--font`/`--mono` (+ Tailwind `font-sans`/`font-mono`). **Reuse:** `apps/admin` already self-hosts Outfit via `next/font/google` — lift that setup and add JetBrains Mono. Must land before Slice 8, else every restyled screen still paints in system fonts.
- **Slice 2 — Auth/session code fixes** *(code)*: redirect auth success → `/reservar` in `entrar/actions.ts:24`, `auth/confirm/route.ts:43`, `restablecer/actions.ts:23`; surface `email_not_confirmed` distinctly in `sesion.ts:24-25`; give the header a signed-in state; implement Supabase SSR session refresh in `proxy.ts` (B7).
- **Slice 3 — Turnstile gating** *(code)*: add a `data-callback` that enables submit only when `cf-turnstile-response` is present, plus `data-expired-callback`/`data-error-callback` to reset — in **both** `registro-form.tsx` and `contacto-form.tsx`.
- **Slice 4 — Nav** *(code, minor)*: add "Volver al inicio" `Link href="/"` to `registro-form.tsx` (mirror `entrar-form.tsx:227-229`); optionally `restablecer`.
- **Slice 5 — RED neon ring logo + ignition** *(build — full spec in Doc 2)*: replace `RedMark`/`RedLockup` chevron with the neon broken-ring mark; build `RedRingMark({size, animate})` (deterministic `idSuffix` gradients — zero client JS, stays a Server Component; reduced-motion via `forwards` fill — Doc 2 §4); wire into landing hero (via the **widened `logo{animate}` slot** — Doc 2 §3, *not* a new contract member), auth hero, drawer, favicon — and the **admin** (Doc 2's cross-app test). **Also retune the admin `HERO_OFFSET` (1590ms → the ring's ~2.3s ignition length)** so the admin login-form reveal stays in sync.
- **Slice 6 — Animation system** *(build)*: port the ~12 missing keyframes as **contract-token-driven** CSS (ember bars `pipBreathe`/`mbSweep`/`mbBreathe`, neon-copy, hero ignition) into `@gym/ui`/`globals.css`; **note glows are not in the token contract yet** — add a glow/box-shadow token channel or brand-scoped CSS. Extend the reduced-motion guard (§3.5).
- **Slice 7 — RED copy/voice** *(build + decision)*: restore the neon tagline "Con beneficios de luz roja" and the per-screen verbatim strings. **Decision:** which strings are brand-voice (hardcode in the RED module) vs data (new DB columns). Gap list in §4.
- **Slice 8 — Per-screen dark-neon fidelity** *(build)*: restyle each screen to the mock — ticket perforations/notches, ember bars, two-column "Qué trabajamos", square-outline confirmed check + `cfpop`, hero compositions, etc. Drive from the §4 table.
- **Slice 9 — Small schema/data touches** *(prerequisite of Slices 7–8 — land each column just-in-time as the leading step of the screen that needs it, not after)*: `paquetes.nota` (per-plan note), `class_type_workblock.value` (2-column program), `about_story`/tagline columns (nosotros), gym address (confirmada "Estudio" row), the confirmada→reservas deep-link (`/reservar?perfil=1` honored by `ReservarSemana`).

---

## 7. Decisions needed from the owner

1. **RED = dark-only** (recommended, matches mock) vs dual-scheme with dark default? → drives Slice 1 shape. Dark-only means dropping RED's now-vestigial **light** token fill (`red/tokens.ts` light block), else it ships as dead config.
2. **Retune RED dark tokens** to the mock's exact hex (§3.1) or accept the near-match?
3. **Copy strategy** (Slice 7): hardcode RED brand voice in the module, or model it as DB columns (per-plan note, about_story, taglines)? Which strings are identity vs data?
4. **Add an amber `--danger`/warning channel?** This is a **contract change, not a value swap** — the 28-key contract has no amber slot, so warnings borrow the `red` error token today (collapsing the accent/warning contrast). Amber = a new `TOKEN_KEYS` key + a fill in *every* brand + an override-schema entry (§3.1 crosswalk). Decide whether the fidelity is worth forking the shared warning semantics.

**Confirm-defaults (not real forks — pre-answered in §4/§8, listed only to tick):** public schedule stays gated (the register-before-reserve funnel + members-area gating are by-design; add a logged-out schedule view only if you *want* one) · all "beyond-mock" enhancements stay (they're strengths, §8).

---

## 8. Already correct — do not touch
Brand resolution + token injection plumbing · `gym` rows / `brand_module_id` / `token_overrides` · all data-wiring (often exceeds the mock) · field-level form fidelity · drawer nav structure + verbatim form copy · the booking-confirm morph animation.

## 9. Execution notes
- **Verify per slice:** `curl` the page for `.dark` + the served tokens; eyeball against the mock (path in the header); for auth, watch the Supabase auth logs.
- **Key file map:** theme → `layout.tsx`, `packages/brand/src/tokens.ts`, `registry.ts`, `red/tokens.ts`; logo/anim → `packages/brand/src/red/{logo,login-animation,login-hero}.tsx`, `globals.css`; auth → `apps/client/src/app/{entrar,registro,restablecer,auth/confirm}/*`, `packages/data/src/server/{sesion,supabase}.ts`, `proxy.ts`; per-screen → the routes in §4.
- **Raw audit data** (exhaustive per-screen gaps + the full design-system markdown) lives in the workflow outputs.
