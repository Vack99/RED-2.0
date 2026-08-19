# Handoff — iBookit product video (HTML, screen-recordable)

2026-08-18. Design was brainstormed and **approved by the owner** ("build it") in a session that
turned out to be on the wrong worktree (`main`). This doc is the full plan; the next session
executes it. **Run the build session in the reskin worktree**
(`.claude/worktrees/ibookit-app-ui`, branch `ibookit-app-ui`) — it holds the current in-use app
look (house-theme reskin) and the live brand modules; `main`'s `packages/brand` is stale on that.

## What to build

One **self-contained HTML file** → `docs/brand/07-product-video/index.html` (commit on the branch
the session runs in). It is a ~50-second, auto-playing, timed motion piece meant to be
**screen-recorded into an .mp4** for ads, the marketing page, WhatsApp — anywhere.

Locked decisions (owner-approved, don't re-ask):

- **16:9, fixed 1920×1080 stage** that letterboxes/scales to fit the window.
- **Space starts** the timeline (clean start for OBS), **R restarts**. Cursor hidden during play.
  No visible chrome/controls on the stage while playing. Hold the last frame (clean out-point).
- Pure CSS keyframes on `transform`/`opacity` only (60 fps capture). One master timeline via a
  `.playing` class + `animation-delay` offsets. No scroll, no libraries.
- **Spanish (es-MX)**, locked identity: El lugar 3×3 mark, plum, Hanken Grotesk
  (`docs/brand/03-visual-identity/final/`, `docs/brand/03-visual-identity/IDENTITY.md`).
- Copy obeys `docs/brand/05-marketing/DISTILLED-TASTE.md` (no invented numbers, no
  *impulsa/potencia/revoluciona/solución integral*, sentence case, tú-register) and the
  do-not-claim list in `docs/brand/PRODUCT-BRIEF.md` §6 (no online payments, no native app, no
  push/SMS, no analytics claims).

## The five scenes (~50 s)

1. **Cold open (0–6 s)** — the 3×3 mark draws in on the warm canvas (reuse the concept from
   `docs/brand/06-house-theme/login-mark.html`), then the iBookit lockup.
   Tagline: *«La recepción de tu negocio.»*
2. **The four questions (6–14 s)** — from PRODUCT-BRIEF §1, four quiet type-on lines:
   *quién es tu cliente · qué pagó y cuándo vence · quién viene hoy · quién sí llegó.*
3. **The member app (14–22 s)** — a phone mockup rises center-stage playing splash → inicio →
   agenda in the **house theme as it exists in the reskin worktree**; one line beside it: clients
   book from their phone, no install (*sin instalar nada*).
4. **The chameleon (22–40 s — the money shot)** — the SAME phone morphs through full brand skins:
   palette, typeface, business name and booking verb all swap while the layout holds.
   Copy: *«Tu marca, no la nuestra.»* This is the positioning axis (booking unit, not industry).
5. **Close (40–50 s)** — brief staff-console beat (Inicio/Vender cards, house theme), then mark +
   lockup + **ibooki.lat**, hold.

## Chameleon roster — REAL brands first (the owner's amendment)

The original design only used the fictional skins from the two Downloads docs. The owner
corrected this: **the gyms actually in use today must be contemplated too.** So the morph cycle is:

1. **Real, in-use** — read tokens/marks from `packages/brand/src/` in the worktree:
   - **RED** (`src/red/tokens.ts`) — dark-only neon: canvas `#0a0a0a`, crimson fill `#b5161c`,
     deep crimson `#7e0d10`, white on crimson. Ring mark in `ring-mark.tsx`.
   - **Forge** (`src/forge/tokens.ts`) — read from the worktree; ignition mark in
     `ignition-mark.tsx`.
   - (House theme is already scene 3's skin — it opens the morph as "sin marca propia".)
2. **Fictional breadth** (shows vertical-neutrality) — pick 3–4 of the six below to keep pace;
   suggested: Reforma, Ānanda, Ryūsei, Nocturno. Verbs matter: they prove the booking unit
   changes per giro (APARTAR CAMA / APARTAR TAPETE / AGENDAR CLASE).

Six fictional skins, extracted from the owner's two source docs (full app screens in
`C:\Users\Aaron\Downloads\iBookit Marcas Alternativas.dc.html`, animated wordmarks in
`C:\Users\Aaron\Downloads\iBookit Booking Marcas.dc.html` — both ~150 KB canvas exports; the
table below is the distilled version, only open the originals if a screen needs copying closely):

| Skin | Giro | Type | Palette | Signature motion / lexicon |
|---|---|---|---|---|
| **Reforma** · Polanco | estudio reformer boutique | Instrument Serif + Manrope | junípero `#4F6152` sobre hueso | carro corre sobre rieles · camas, Instr., Paquetes · APARTAR CAMA |
| **Casa Ānanda** · Roma Norte | casa de yoga | Marcellus + Mulish | avena `#EDE3D2` + terracota `#A85A38` | círculo que respira (4·4) · tapetes, salas Loto y Luna · APARTAR TAPETE |
| **Dojo Ryūsei** | karate-dō shotokan | Zen Antique + Zen Kaku Gothic | washi `#F6F4EF`, sumi `#16140F`, rojo `#B3202A` | ensō trazado, movimiento seco · Sensei/Sempai, EN TATAMI, cintas |
| **Academia Nocturno** · 1998 | academia de piano | Cormorant Garamond + Jost | laca negra `#15171C` + latón `#C39A4E` | teclas que se hunden · alumnos, Mtro./Mtra., Colegiaturas |
| **Malva** | pilates & barre femenino | Bodoni Moda itálica + Outfit | rubor `#F7DCE4` + rosa profundo `#B0567B` | flor de malva con rebote corto |
| **Ximena Rueda** | maestra particular de piano (1:1) | Newsreader itálica + Karla | papel cálido + tinta índigo `#2F3C6E` | metrónomo · huecos de 45/60 min, estudio o domicilio |

Rebuild phone screens natively in the video file (inspired by the sources, not pasted — the
`.dc.html` wrappers are canvas-tool markup and won't transplant).

## Process notes for the build session

- Brainstorming is DONE and the design approved — go straight to build; only re-open questions
  if the worktree contradicts something here.
- One open item to confirm with the owner at session start (one picker, nothing else): the final
  chameleon roster order — real-only vs. real + which fictional skins.
- Skills: `frontend-design` / taste guidance filtered through DISTILLED-TASTE (it overrides
  skill defaults); `keep-it-lean` on the file.
- Verify by opening the file, playing it end-to-end, and checking the timeline against the scene
  timings above before calling it done.
- Commit locally on the session's branch. **No push without explicit owner consent.**
