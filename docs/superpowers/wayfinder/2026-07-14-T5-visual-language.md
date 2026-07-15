# T5 — Tracker look & gamification language

> **Wayfinder asset** · resolves [T5 · Tracker look & gamification language](https://github.com/Vack99/RED-2.0/issues/110) (#110) on map [#105](https://github.com/Vack99/RED-2.0/issues/105) · 2026-07-14
>
> **What this is:** the fixed visual language for the gamified localhost scope tracker — the direction chosen (and what was rejected), the status→visual vocabulary, the earned-vs-ahead treatment, the re-skin CSS-custom-property contract, and the motion rules. The concrete proof is the sibling mock **`2026-07-14-T5-tracker-mock.html`**, which renders it from a hardcoded object shaped to the [T2 schema](https://github.com/Vack99/RED-2.0/blob/main/docs/superpowers/wayfinder/2026-07-14-T2-scope-model-schema.md) using [T1's real Foundation data](https://github.com/Vack99/RED-2.0/blob/main/docs/superpowers/wayfinder/2026-07-14-T1-foundation-catalogue.md).

---

## The direction — an expedition route, not a game HUD

The tracker **is** the wayfinder tool, so the metaphor is a **wayfinder's route**: a vertical trail from a glowing conquered **base camp** (World 1, Foundation) climbing into cooling **frontier fog** (Worlds 2–7), all pointed at one destination banner — *"RED is sellable across Latin America."* Seven worlds are seven legs of one journey.

**The single organizing idea:** one hot accent — **RED crimson neon** — means exactly **one** thing everywhere it appears: *earned ground*. Foundation glows crimson because it is conquered; the frontier is dim and cool because it is honestly empty; and where a quest shipped *ahead* inside a frontier world, it glows crimson too — a beacon in the fog. **Every crimson pixel is really earned.** That single-accent discipline is what makes the progress honest at a glance: you cannot fake conquered territory, and the eye reads the earned/ahead split before it reads a single word.

### What gamification language was chosen

- **Worlds as named realms** with emoji identity and an honest, rolled-up progress bar (never hand-set — computed from the quests inside).
- **A strong earned-vs-ahead split** carried entirely by the crimson accent + a cool "fog" treatment. Foundation renders **collapsed-but-rich** (its eight phases become compact *conquered clusters*, each a glowing mini-bar, expandable to real quests); frontier worlds show their quest lists; the two deepest-fog worlds (Support, LatAm) dim further.
- **The route spine** — a crimson-at-base, fog-at-frontier trail line threading node markers (filled crimson orb = conquered, hollow ring = frontier, faint = deep fog).
- **Restrained, earned motion:** bars fill from zero on load, the arc headline counts up, and the *one* active frontier node breathes a slow glow pulse. Nothing else moves.

### What was deliberately rejected (and why)

| Rejected | Why |
|---|---|
| **XP / points / levels** | Rewards grinding, not truth. The value is *seeing real state*, not accumulating a score. A points number would drift from reality the moment it's decorative. |
| **Streaks / daily goals** | This is a strategic arc measured in months, not a habit tracker. A broken streak would punish honest pacing. |
| **Badges-for-badges / achievements** | A badge is a second, fake progress signal competing with the real one (shipped quests). One source of truth only. |
| **Confetti / celebratory bursts** | Cheapens genuine milestones and reads as AI-generated filler. The reward is the crimson territory itself lighting up. |
| **Leaderboards / social** | Solo-dev localhost tool. No one to compare against; the destination is the only benchmark. |
| **A generic "big number + gradient" hero** | The templated default. The hero here is the *destination sentence* + an honest arc bar, because the north star is the thing worth remembering. |

---

## The visual vocabulary

### Status → chip (the 5 stored + 2 derived states from T2)

Each chip pairs a **color + a word** (never color alone), matching the dataviz status-palette rule. Owner-actionable states are made **loud** on purpose — they are the owner's to-do list.

| State | Source | Chip label | Color token | Emoji marker | Treatment |
|---|---|---|---|---|---|
| **shipped** | `gh` all-closed, or `status` | `Shipped` | `--st-shipped` (green) | — | solid green chip; if earned-ahead, crimson row wash |
| **shipped-with-open-threads** | shipped **and** caveats non-empty | `Shipped` | green chip | **⚠️** | green chip + amber ⚠️ marker; caveats visible below |
| **in-flight** | `gh` some-closed | `In flight` | `--st-inflight` (amber) | — | amber chip, partial bar |
| **todo** | `gh` zero-closed, or `status` | `Not started` | `--st-todo` (slate) | — | recessive — the frontier default |
| **deferred** | `status` | `Deferred` | `--st-deferred` (dim indigo) | — | dim, italic — intentionally postponed |
| **needs-decision** | `status` | `Needs your call` | `--st-decision` (violet) | **🧭** | **LOUD** — violet left-bar, pulse, compass; owner strategy call |
| **blocked** *(derived)* | any `depends_on` not yet shipped | `Blocked` | `--st-blocked` (dim red) | **🔒** | **locked & dimmed** (row at 62% opacity) + "blocked by X" — dormant, *not* loud (it's not the owner's move) |
| **awaiting owner walk** *(derived)* | `kind: gate`, deps shipped, issue still open | `Awaiting your walk` | `--st-walk` (gold) | **🚶** | **LOUD** — gold left-bar, pulse; the owner must walk this HITL gate |

**Two loud, one dim — the deliberate asymmetry.** `needs-decision` (🧭) and `awaiting-walk` (🚶) are the owner's move, so they pulse and carry a bright left-edge bar. `blocked` (🔒) is *not* the owner's move — it waits on a dependency — so it reads dormant (dimmed, locked), never competing for attention with the real to-dos.

### Earned vs. ahead — the load-bearing split

| | Earned (conquered) | Ahead (frontier) | Deep fog (Worlds 6–7) |
|---|---|---|---|
| **Accent** | crimson glow on node, bar, header tag | cool/dim, dark bar track | cool + panel opacity ↓, emoji desaturated |
| **Node** | filled crimson orb, glow ring | hollow ring, muted | faint hollow ring |
| **Panel** | crimson hairline + soft outer glow + corner wash | neutral hairline | slightly transparent |
| **Realm tag** | `Conquered` (crimson) | `Frontier` | `Deep fog` |
| **Default open?** | yes (Foundation) | only the one active frontier | collapsed |

**Earned-ahead** needs nothing special in the data (per T2, `world` is positional and `status` is independent): a `shipped` quest sitting under a frontier world simply gets a **crimson row wash** — the beacon-in-the-fog. In the mock these are real: member self-registration under World 2, the scale audit / RPC harness under World 4, RED brand identity under World 5, the contact channel + SMTP infra under World 6.

### Caveats — visible small print, never hidden

Caveats render inline under their quest (amber ⚠ bullet) or in a bordered **"Open threads"** block at the top of a world's body ("kept visible so the map never over-claims *done*"). A caveat that links (`ref: {type: issue}`) renders the `#N` link. This is the anti-over-claim mechanism: Phase 3 / 7a / 7b all show shipped-with-⚠️ because their real caveats are present, not swept under a green check.

### The unmapped-issues inbox (T6's requirement, previewed)

A distinct dashed-border panel below the route: open issues carrying no quest label and enumerated nowhere. Mocked with real #89 (attendance-ledger ruling — `needs ruling`) and #104 (recibo PNG bug — `bug`), plus one SAMPLE. Framing copy: *"Nothing filed silently vanishes — it lands here until labeled into a quest or consciously ignored."*

---

## The re-skin surface — the CSS custom-property contract

Everything themeable lives in **one `:root` block** at the top of the HTML. The render code references roles, never raw hex, so swapping this block re-themes the whole tracker. To re-skin (e.g. Forge amber instead of RED crimson): change `--earned*`, the fonts, and optionally the status hues.

| Group | Properties | Role |
|---|---|---|
| **Type** | `--font-display`, `--font-body`, `--font-mono` | Outfit-evoking display/body; JetBrains-Mono-evoking mono for all numbers/ids (system fallbacks, no CDN). |
| **Canvas & surface** | `--canvas`, `--canvas-2`, `--surface`, `--surface-2`, `--surface-3`, `--hairline`, `--hairline-hi` | dark plane + three panel elevations + two hairline strengths. |
| **Ink** | `--ink`, `--ink-2`, `--ink-3`, `--ink-faint` | primary → faint text ramp. Text always wears ink tokens, never a status/accent hue. |
| **THE accent (earned)** | `--earned`, `--earned-soft`, `--earned-deep` (owner's recibo Vino `#7e0d10`), `--earned-glow`, `--earned-glow-2` | the single hot accent = earned ground. **Change these to re-brand.** |
| **Frontier / fog** | `--fog`, `--fog-track`, `--fog-line` | the cool unearned axis: node borders, empty bar tracks, the spine's faded upper reach. |
| **Status** | `--st-shipped`, `--st-inflight`, `--st-todo`, `--st-deferred`, `--st-blocked`, `--st-decision`, `--st-walk` | the 7-state palette; reserved (a status hue never doubles as decoration). |
| **Geometry & motion** | `--radius*`, `--gap`, `--ease`, `--fill-dur`, `--pulse-dur` | corner radii, the shared easing curve, bar-fill and pulse durations. |

**Palette provenance:** the accent is the owner's demonstrated RED dark-neon look (crimson `#ff2e4d`, deep tone the recibo Vino `#7e0d10`). Status hues derive from the dataviz status palette (good/warning/serious/critical), brightened for the dark neon surface and paired with icon+label so no meaning rides on color alone. This is a committed dark-only aesthetic (a personal localhost tool on a dark canvas), so it does not ship a light mode — the re-skin path is swapping the `:root` values, not a theme toggle.

---

## Motion rules

| Moment | Motion | Rule |
|---|---|---|
| **Page load** | every bar fills 0→value; arc headline counts up | staggered via `--fill-dur` on the shared `--ease`; the reward is territory *lighting up*. |
| **Active frontier** | the one next-up frontier node/panel breathes a slow glow pulse (`--pulse-dur`) | exactly **one** pulsing world — the current edge of the map. |
| **Owner to-dos** | `needs-decision` + `awaiting-walk` rows pulse their surface | draws the eye to what only the owner can move. |
| **Expand/collapse** | world bodies & Foundation clusters toggle; bars fill on first reveal | so a bar never animates while hidden. |
| **`prefers-reduced-motion`** | **all** animation off; every bar and the arc snap to final value; no pulse, no count-up | honored via a media query *and* a JS guard — final state is always reachable without motion. |

Accessibility floor held throughout: keyboard-operable world/cluster toggles (Enter/Space) with visible focus rings, real `#N` links to GitHub issues, status carried by icon+label+color together, responsive down to mobile (bars stack, gh columns drop).

---

## For T6 (the real renderer)

The mock's `<script>` is a working head start: `DATA` is T2-schema-shaped, `resolve()` implements the T2 derivation (auto-status from `gh`, `status` overrides, `shipped-with-open-threads`, `blocked` via `depends_on`, `awaiting-walk` for gates), and `worldProgress()` is the honest rollup. T6 swaps the mock `_gh: {closed,total}` fields for live `gh` calls and reads `docs/scope-model.yaml` in place of the inline `DATA`; every render function and the entire visual language above carry over unchanged.

**One taste call left open (see mock summary):** the arc headline uses the same quest-weighted rollup at every level (`earned quests / total quests` = **54%** on the compressed sample) while only **1/7 realms** is fully held. The formula is deliberately identical at quest/world/arc level for consistency; on the *real* fully-enumerated ahead worlds the arc naturally falls as todo quests are added. T6 may instead weight the arc per-realm (mean of the 7 world %s ≈ 40%) if the owner prefers the headline to track "legs of the journey" over "share of quests" — a one-line change, flagged rather than silently chosen.
