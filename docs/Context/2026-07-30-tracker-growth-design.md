# GROWTH-1 — tracker growth design (procedural realms + agent-side filing)

> Designed 2026-07-30. 6 agents (5 area investigations + synthesis), 60 findings, 977,646 subagent tokens.
> Rulings it implements: R1 procedural realms / R2 agents create quests (option B) — see
> `2026-07-30-tracker-usefulness-cross-examination.md`.
> Working prototype rescued to `2026-07-30-growth-prototype/`; its 311-assertion parity run was
> re-verified in the main session (sha1 445f98dc… byte-identical to draft-f.png).
> READ-ONLY design — no tracker file was modified. The concurrent session owns red-tracker/.

---

# GROWTH-1 — Making the tracker absorb realms, quests and issues without hand art

**Design synthesis, 2026-07-30. Read-only session; five area investigations + independent verification.**
**Status: buildable. Execute in a fresh session against `C:/Users/Aaron/Documents/Repos/red-tracker/` (NOT a git repo — edit in place).**

---

## 1. Verdict

**Ruling 1 is achievable in full for the growth the project will actually see, and the expensive-sounding half is the cheap half.** Zero-hand-art realm rendering is not a research problem: Area 1 built the derive-with-override refactor of `overworld.mjs` in a scratch copy and the **unmodified `check-overworld.mjs` passed all 311 assertions with the pinned draft parity sha1 `445f98dc0fd8a12880e7ccfe4c10b0fa7679c5ae` intact**, while an 8th realm rendered with a biome, a density, a keep, a road connection, a fog burn tracking its pct and a live brazier channel — none of it authored. Cost: +46 lines, +1,513 bytes. The reason it is cheap is that the map is already ~97% algorithmic: only 40 of `overworld.mjs`'s 1,332 lines are realm-keyed tables, and those tables are not arbitrary — `BIOME` is exactly `KIT_BANK[i % 6]`, `BORDERS` is exactly `V1 − (i+1)·SPAN` with `SPAN = (482−98)/6 = 64`, and seat latitude is exactly `bandFloor + SPAN/2 − 2`. Two areas derived that lattice independently and both got the authored integers byte-exact.

**The genuinely hard half is the gates, and it is hard for a social reason, not a technical one.** Four of the six fidelity gates assert *that the project has not made progress*. `check-viewmodel.mjs:19` says `EXPECT_QUESTS = 74`; `:21` says `EXPECT_PCT = [71, 25, …]`. Shipping one Foundation quest moves 10/14 → 11/14 = 79% and reds the gate. That is not a fidelity check, it is a stale snapshot with an assertion wrapped round it, and it is why `docs/scope-model.yaml` has 2 commits in its entire history: the tracker punishes its own growth. Ruling 2 — agents create quests — is *impossible* until this is fixed, because the first agent-created quest turns the build red.

**What is genuinely not achievable under the standing constraints:** unbounded realm growth. `554×516` is hardcoded in three runtime modules (`shell.mjs:11-12`, `interior.mjs:48-49`, `panels.mjs`) and screen-y ≈ `v + 2z`, so extending the continent costs ~1 px of canvas per v-unit. Realms must therefore *subdivide* a fixed continent. Measured ceiling: **8 realms at `castle-32`, ~11–12 with auto-downgrade to `castle-24`**, both models already existing. Realm 13 needs a two-column band layout, which changes how the journey reads (no longer a south-to-north march) and is a product decision nobody has made. That is the one thing that would have to give.

**One correction to the brief's ground truth, measured twice and by me a third time: G4 is wrong about `check-overworld.mjs`.** Its `sites === 7` (`:87`) and `bands === 7` (`:94`) do **not** red when the project grows — the file has zero occurrences of `status.js`, `STATUS` or `buildViewModel`; it drives `composeOverworld` from a 7-entry `FROZEN` literal declared inside the gate at `:22-30`. It printed **311 assertions PASS on an 8-realm model it is structurally incapable of drawing**. The defect is the exact opposite of the one named: not a false red, a **false green**, on the single most dangerous surface. This changes the priority order in §7.

---

## 2. What is already true — do not rebuild it

| surface | growth behaviour | evidence |
|---|---|---|
| `index.html` (expedition skin) | Renders **all three** growth events with zero edits — 8 world panels, 34 subgroup headings, 77 quest rows, correct rollups, subline "as 8 realms" | Area 5 ran the real inline `<script>` (`:473-939`) against three grown snapshots |
| `viewmodel.mjs` structure | Fully generic over `model.worlds` — no hardcoded count | Area 3, Area 5 |
| `interior.mjs` | **Zero realm-id literals.** Layout derives from `world.subgroups[].quests.length`; kits fall back `KITS[world.biome] ?? KITS.summer` (`:595-596`). Composed an 8th realm cleanly, `tilesUnderChrome=0` | G3 CONFIRMED by Areas 2, 3, 4, 5 independently |
| `panels.mjs` | Generic; built 34 PRD cards + 77 quest popups for an 8-realm model | Area 5 |
| `gen-arcade.mjs` | Regex module-graph discovery, no hardcoded module list; interiors compose at **runtime**, never baked. An 8th realm adds **0 bytes** to `arcade.html` | Area 2, Area 5 |
| `PASS` / road / fog-burn origin | `PASS` is **already computed** at `overworld.mjs:400-407` (midpoint of adjacent seats, ±14 by index parity, snapped to the wobbled border). Only two literals remain: the landfall waypoint `:399` and `'foundation'` at `:524` — both derive exactly | Area 1 — **corrects G2's claim that `PASS` is a hand-keyed table; `:317-323` is `SEAT_UV`, not `PASS`** |
| `check-panels`, `check-shell`, `check-emit` | Zero literal counts tied to live `status.js` | Area 3 full-read + grep |

**Baseline measured this session, 2026-07-30 19:45:** `for c in viewmodel interior overworld panels shell emit; do node arcade/check-$c.mjs; done` → **5 PASS, `check-emit` FAIL**. The emit failure is *stale-only*: `arcade.html` is 314,554 B on disk vs 318,770 B fresh. That is the concurrently-running panel session's uncommitted module edits, not a defect. Byte headroom against the 600 KB ceiling: **295,630 B**. (`arcade.html` is 314.5 KB, not the 292.6 KB in the brief.)

---

## 3. The derive-with-override design

### 3.0 Step zero — rescue the prototype

Area 1's working prototype lives in a **session-scoped scratchpad that will be garbage-collected**. Before the fresh session starts, copy it out:

```
C:/Users/Aaron/AppData/Local/Temp/claude/C--Users-Aaron-Documents-Repos-RED-2-0/
  5e4d8dc2-3943-4a94-84d0-c1cb37cf1fb1/scratchpad/{ow-derived.mjs,ow-base.mjs,patch.cjs,gate-derived.mjs}
```
`ow-derived.mjs` (55,854 B) is the refactored module; `gate-derived.mjs` (8,745 B) is the *untouched* `check-overworld.mjs` with only its two import paths rewritten. If they are gone, §3.1 below is a complete specification and re-derivable in about an hour — but re-measuring the sha1 is the expensive part, so copy them.

### 3.1 `overworld.mjs` — 7 tables → 4 banks + 2 override maps + one `layout()`

**The banks** (replacing `BIOME` `:43-53`, `DENSITY` `:55-63`, `BORDERS` `:295`, `MAINLAND`/`JOURNEY` `:299-300`, `SEAT_UV` `:316-324`, `FLIPS` `:325`, `seatWD` `:326`):

```js
const KIT_BANK = [                                   // === today's BIOME, read in journey order
  ['grass','grass2','orchard','orchard2','farmcoral'],           // i%6 = 0  summer
  ['springgrass','springgrass2','springtree','springtree2','flowerwhite'],
  ['autumngrass','autumngrass2','autumntree','autumntree2','dirt'],
  ['taigagrass','taigagrass2','pine','pine2','stone'],
  ['harvestgrass','harvestgrass2','olive','olive2','sand'],
  ['mistgrass','mistgrass2','mistytree','mistytree2','stone'],
]
const DENSITY_BANK = [[1.00,1.30,false],[1.05,0.55,true],[1.45,0.35,false],
                      [1.70,0.15,false],[0.45,2.10,false],[0.90,0.45,true]]
const KEEP_SIZE = { 'castle-32': [30,20], 'castle-24': [21,14] }   // === the models' own nx,ny
```

**Verified by me:** `overworld.mjs:52` — `'latam-expansion'` is `['grass','grass2','orchard','orchard2','farmcoral']`, character-for-character `foundation`'s row, with the comment `// 0% earned: never shown`. So `KIT_BANK[i % 6]` reproduces **all seven** authored rows with **zero override entries**. `DENSITY`'s latam row `[1.00, 0.50, false]` *differs* from foundation's — but it is provably dead: `grep -n DENSITY overworld.mjs` returns exactly `:55` (definition) and `:896` (the only read), and `:894` is `for (const id of MAINLAND)`. The island's density is never evaluated. `DENSITY_BANK[i % 6]` is therefore also exact for every value the composer reads.

**The overrides — the only genuinely hand-authored values.** Two maps, and **both MUST be written COMPLETE for all seven realms, including explicit `false`:**

```js
const U_SEAT = { foundation: 62, 'sellable-product': -48, monetization: 44,
                 'growth-reach': -66, 'go-to-market': 38, 'customer-support': -52,
                 'latam-expansion': 10 }
const FLIP_OVERRIDE = { foundation: false, 'sellable-product': false, monetization: true,
                        'growth-reach': false, 'go-to-market': true,
                        'customer-support': true, 'latam-expansion': false }
```

> ### ⚠ THE PARITY TRAP — read this before writing a line
> `FLIPS` at `overworld.mjs:325` is `{ monetization: true, 'go-to-market': true, 'customer-support': true }`. **The other four realms are `undefined`, i.e. false-by-omission — absence encodes a value.** Area 1's first prototype gave unlisted realms a hash-derived coin flip; it flipped `foundation`, `sellable-product` and `latam-expansion` and the sha1 came out `fdc9e351e643d22b0b96450187fb492ba60934b9` instead of `445f98dc…`. Every other point of a 16-point refactor was already exact; **this one table was the entire delta.** Writing `FLIP_OVERRIDE` complete — all seven, explicit `false` — is what confines the derived branch to genuinely new realms. Any table converted to derive-with-override must be audited for absence-as-value first.

**The derivation** — one function, called first thing in `composeOverworld`:

```js
const VLAND0 = 98                                   // the channel's south floor
function layout(ids) {
  JOURNEY  = ids.slice()
  MAINLAND = ids.slice(0, -1)                       // last realm === the island (§9 ruling C6)
  const m  = MAINLAND.length
  SPAN     = (V1 - VLAND0) / m                      // m=6 -> exactly 64
  BORDERS  = []; for (let i = 0; i < m - 1; i++) BORDERS.push(V1 - (i + 1) * SPAN)
  ids.forEach((id, i) => {
    const island = i === ids.length - 1
    KIT[i] = KIT_BANK[i % 6]                        // exact for i<6; ring for laps >= 1
    const d = DENSITY_BANK[i % 6]
    DEN[i] = i < 6 ? d                              // exact
      : [d[0] * (0.75 + 0.5 * rnd(hashId(id), i, 41)),
         d[1] * (0.75 + 0.5 * rnd(hashId(id), i, 42)), d[2]]
    const fits = (c) => KEEP_SIZE[c][0] + KEEP_SIZE[c][1] + 4 <= SPAN
    KEEPCLASS[id] = island || !fits('castle-32') ? 'castle-24' : 'castle-32'
    const u   = id in U_SEAT ? U_SEAT[id] : seatFallbackU(id, i)
    const ext = KEEP_SIZE[KEEPCLASS[id]][0] + KEEP_SIZE[KEEPCLASS[id]][1] - 2
    SEAT_UV[id] = [u, island
      ? Math.round(chanN(u) / 2 + 2)
      : Math.round(Math.min(V1 - (i + 1) * SPAN + SPAN / 2 - 2,   // === the authored v
                            vMaxAt(u) - ext / 2 - 4))]            // coast clamp, no-op today
    FLIPS[id] = id in FLIP_OVERRIDE ? FLIP_OVERRIDE[id] : rnd(hashId(id), i, 55) < 0.5
  })
}
```

**Exactness proof, measured independently by Areas 1 and 5:** at `m = 6`, `SPAN = (482 − 98)/6 = 64`, and `V1 − (i+1)·SPAN` yields `418, 354, 290, 226, 162` — the authored `BORDERS` (`:295`) to the integer. `bandFloor + SPAN/2 − 2` yields `448, 384, 320, 256, 192, 128` — the authored `SEAT_UV` v column (`:316-324`) to the integer. The coast clamp is inert today (448 vs a 455.6 cap). Area 5 swept candidate south-lip constants; only `LIP = 98` is exact (90/96/100/104 all miss).

**`seatWD`'s magic numbers are not tuning.** `castle-32`/`castle-sealed` build to `nx=30, ny=20`; `castle-24` builds to `nx=21, ny=14`. `seatWD = (id) => id === 'latam-expansion' ? [21,14] : [30,20]` (`:326`) is a hand-maintained mirror of data the models already carry, and its id special-case agrees with the keep-class choice at `:1022`/`:1033` only by the coincidence that latam is the sole `castle-24`. `KEEP_SIZE[KEEPCLASS[id]]` deletes the special case *and* a latent desync bug.

**Remaining id literals, each replaced by a fact rather than a name:**

| line | today | derived from |
|---|---|---|
| `:399` | landfall waypoint `[104, 476]` | `[SEAT_UV[MAINLAND[0]][0] + 42, V1 − 6]` (exact) |
| `:524` | fog-burn origin `id === 'foundation'` | `id === MAINLAND[0]` |
| `:303`/`:306` | `bandAt` fallbacks | `JOURNEY[n−1]` / `MAINLAND[m−1]` |
| `:956` | conifer mix | `kit[2] === 'pine'` (the taiga kit, wherever it lands) |
| `:1022`/`:1033` | keep model | `KEEPCLASS[id]` |
| `:1194-1195` | cloud punch depth | `realmOf(id).pct === 0` (a 0% band is a solid deck and needs a real gap — the honest reason) |
| `:1239-1240` | channel crossing | `JOURNEY[n−2]` / `JOURNEY[n−1]` |
| `:1276` | chip offset | `KEEPCLASS[id] === 'castle-24'` |
| `:851-859` | `realms.length !== JOURNEY.length` **and** per-index `r.id !== JOURNEY[i]` | `realms.length < 3` throws. **Delete the order guard** — the census now *defines* the journey, so order is true by construction rather than by assertion (§9 ruling C7) |

### 3.2 Why an unknown realm looks *intentional*, not random

This is the constraint the whole design exists to protect. Four mechanisms, each principled:

- **Biome — a seasonal ring, not a hash.** The 8th realm takes the *next* kit on the ring, so the journey keeps reading as an arc (summer → spring → autumn → taiga → harvest → mist → summer…). Every key is an existing `voxpalette.mjs` `MATS` entry; nothing new is authored; adjacent realms can never share a ground tone — a guarantee a hash cannot make.
- **Density — inherited from the biome it belongs to.** Taiga gets forest `[1.70, 0.15]`; harvest gets farmland `[0.45, 2.10]`. The tuned numbers are not deleted; they *are* the bank. Lap-≥1 realms get ±25% jitter inside the authored envelope (tree 0.45–1.70, field 0.15–2.10) so realm 7 is a cousin of realm 1, not a pixel twin.
- **Position — the zig-zag continues.** East/west alternation, magnitude drawn from the observed gamut `|u| ∈ [38, 66]`, nudged inward in 6-unit steps until `seatClear()` confirms the whole footprint is on the slab and clear of the interior lakes — an analytic test over pure functions, so it runs before the grid exists.
- **Keep — the whole map downgrades together.** Every realm gets the largest castle its band can hold. Scale reads as deliberate, never as one odd small castle.

**Ruling against Area 5's recombination pool** (§9, C2). Area 5 proposed 6×6×5 = 180 kits assembled column-by-column from `hashStr(id)`, and correctly found a hazard: `floweryellow` is a `MATS` key that `interior.mjs`'s `WARM2FOG` (`:108-121`) does **not** cover, and `interior.mjs:938` (`else if (!WARM[i] && top in WARM2FOG) top = WARM2FOG[top]`) leaves an unmapped key standing as *warm ground inside fog* — which over-claims progress and violates `CONTRACT.md`'s Honesty law. I verified both halves: `overworld.mjs:147-154` **does** carry `floweryellow: 'foggrass'`; `interior.mjs`'s does **not**. The ring avoids the entire class: every kit it can emit is an already-authored complete kit whose keys are already fog-mapped in both modules. **The ring is strictly smaller (zero overrides), strictly safer (no new gate needed), and strictly more legible. Take it. Also drop Area 1's lap-≥1 stripe re-pick** — it is the one part of the prototype that leaves the authored kit set, its differentiation value is a thin field accent, and the rule "an overworld kit is always one of the six authored kits, verbatim" is far cheaper to gate.

### 3.3 `viewmodel.mjs` — three one-line fallbacks and one un-named realm literal

```js
// :291  biome — feeds interior.mjs's KITS lookup
biome: BIOME[w.id] ?? SEASON_RING[i % 6],   // SEASON_RING = ['summer','spring','autumn','taiga','harvest','mist']
// :309  label — TODAY SHIPS "undefined 0%" in the page aria-label
label: REALM_LABEL[w.id] ?? shortLabelFor(w.name),
```

Without the biome fallback an 8th realm gets `KITS.summer` — which is **literally `BIOME.foundation`'s five keys**. Area 5 forced the 8th realm to 67% and rendered it: Foundation's green orchard meadow, indistinguishable. **The "eight identical-feeling realms" failure arrives by DEFAULT, not from proceduralisation.** The ring index is what prevents it, and it must be threaded into the `worlds.map` callback (the index is already available).

Without the label fallback, `shell.mjs:304` builds the page aria-label *before* the crash. Area 5 measured the shipped string today: `…SUPPORT 33%, LATAM 0%, undefined 0%`. If the overworld is ever fixed without this, `overworld.mjs:686` draws `${realm.label} ${realm.pct}%` onto the map chip — **`UNDEFINED 0%` in pixel font**.

**A finding no area reported, verified by me:** `viewmodel.mjs:311` hardcodes an eighth realm-id literal —
```js
if (q.status === 'shipped' && w.id !== 'foundation') beacons++
```
"the base camp earns no beacons" is a *positional* fact (index 0), exactly as `index.html:724`'s own comment already says. Under Ruling 1 it must be `i !== 0`. `foundation` **is** index 0, so `EXPECT_BEACONS[0] = 0` is unchanged — byte-identical today. Do not enshrine this literal in the replacement gate assertion (Area 3's draft does; correct it).

### 3.4 `index.html` — three lines, positional

`index.html:724-726` hardcodes four realm ids:
```js
const EARNED_WORLD = "foundation";
const ACTIVE_WORLD = "sellable-product";
const DEEP_FOG = new Set(["customer-support", "latam-expansion"]);
```
The file's own comment on `:723` says `/* ---- world classification (positional, from the model's world ids) ---- */`. They are: index 0, index 1, and the last two. Replace with `i === 0`, `i === 1`, `i >= model.worlds.length − 2` — reproduces today's output exactly. Today an 8th realm renders but falls through to the generic "Frontier" tag, which is *correct*; the defect only bites when a new realm becomes the frontier and the label lies.

⚠ `arcade/CONTRACT.md:6-11` puts `../index.html` on the arcade agents' **Never touch** list. This step needs an explicit orchestrator exemption or a non-arcade agent.

### 3.5 `interior.mjs` — crash guards only (6 lines)

Two shapes hard-throw, and they are precisely the shapes Ruling 2's create-the-quest flow can mint:
- `interior.mjs:583` `it.signSide = -it.tiles[0].side` → *"a district with no quests"* → `TypeError: Cannot read properties of undefined (reading 'side')`
- `interior.mjs:534` `info[n−1].mu` → *"a realm with no districts"* → `TypeError: … (reading 'mu')`

`composeInterior` runs inside a `requestIdleCallback` warm-up (`shell.mjs:557-565`) **and** in `enterWorld`'s click path (`:569-584`) — the page looks fine until the owner clicks that realm.

```js
:485  rows = Math.max(1, Math.ceil(q / perRow))                        // empty district keeps an 18-unit clearing
:583  it.signSide = it.tiles.length ? -it.tiles[0].side : (it.i % 2 ? 1 : -1)
:534  const summitU = n ? Math.round(info[n-1].mu * 0.45 + …) : 0
:519  const gateU   = n ? Math.round(info[0].mu * 0.35) : 0
:1646 entries.push(it.tiles.length ? { questId: it.tiles[0].q.id, walkIndex: tiles.length } : null)
```
A district-less realm then composes as gate + road + cairn + plaque with `tiles: []`. An empty district renders as an **empty lot** — the honest picture of "this effort exists, nothing filed yet."

**These guards are provably parity-safe by construction, not by measurement:** `data-a8.json` (the only input the three interior sha1s ever see — `check-interior.mjs:40-48`) contains `foundation(10sg, 14q)`, `growth-reach(5sg, 15q)`, `latam(3sg, 7q)` — **no empty district, no district-less realm**, so `Math.max(1, …)` and every ternary always take the pre-existing branch. Zero draw-call delta.

### 3.6 Parity proof — the four pinned sha1s

| sha1 | input | at risk? | why |
|---|---|---|---|
| `445f98dc0fd8a12880e7ccfe4c10b0fa7679c5ae` (draft-f) | `check-overworld.mjs:22-30` FROZEN, 7 realms | **NO — measured** | Area 1 ran the *untouched* gate against the refactored module: 311/311 PASS, sha1 MATCH, 2.4 s. Independently, Area 5 derived `BORDERS` and all six mainland seat-v byte-exact at `m=6`. |
| `e917102f6b8944d2cdf8ea44524c58c72d545396` | `data-a8.json` foundation | **NO** | `interior.mjs` gets crash guards only, and `data-a8.json` never exercises them (§3.5). `viewmodel.mjs` cannot reach these renders — the parity arm reads `data-a8.json` directly, never `status.js`. |
| `25dc39344b28a050022f7162d8c51483b560f2f7` | `data-a8.json` growth-reach | **NO** | same |
| `76ed1b0a16d86a484b6a2f4bbd666a45afc1c8c5` | `data-a8.json` latam | **NO** | same |

The parity freeze is narrow and that is what makes this affordable: **no live raster is pinned anywhere.** `check-shell.mjs:419` and `check-panels.mjs:277` compose live interiors but recompute every coordinate they assert against.

---

## 4. The gate migration

Every frozen pin, its JOB-assertion replacement, and the mutation that proves the replacement can still fail. **A relation that no mutation can red is not a gate — it is a comment.**

### `arcade/check-viewmodel.mjs` — the real growth-red surface

| line | frozen pin | JOB replacement | mutation that reds it |
|---|---|---|---|
| `:19` | `EXPECT_QUESTS = 74` | `Σ w.subgroups[].quests.length === Σ w.total`, per world **and** in total | in `buildViewModel`, drop the last quest of any subgroup |
| `:20` | `EXPECT_SUBGROUPS = 32` | `Σ vm.worlds[].subgroups.length === Σ model.worlds[].subgroups.length` | dedupe subgroups by name during derivation |
| `:21` | `EXPECT_PCT = [71,25,18,27,30,33,0]` | `r.pct === (w.total ? Math.round(w.earned/w.total*100) : 0)` and `r.pct ∈ [0,100]` | change `viewmodel.mjs:283` to `Math.floor` |
| `:22` | `EXPECT_BEACONS = [0,2,2,4,3,3,0]` | `r.beacons === count(q.status==='shipped')` over the realm, **0 for index 0** | count foundation's shipped quests too; or drop the `status` filter |
| `:23` | `EXPECT_CAVEATS = [4,1,1,2,0,0,1]` | `r.caveats === w.worldCaveats` (a pass-through, `viewmodel.mjs:318`) | return `worldCaveatTexts.length` instead of `worldCaveats` |
| `:32`,`:33` | `worlds.length !== 7`, `realms.length !== 7` | `vm.worlds.length === vm.realms.length === STATUS.model.worlds.length`, **plus per-index id equality** | drop the last world during derivation; or reverse `realms` |
| `:105-107` | `Object.keys(SHORT_OVERRIDES).length === realSubgroupCount` | **invert to a subset check**: every override key names a real subgroup | leave a stale override key after renaming a subgroup |
| `:108-113` | every subgroup must have a curated override | every subgroup has a non-empty `shortLabel`, ≤10 chars, ending on a word boundary | make `shortLabelFor` return `''` |
| `:202-205` | `foundation.worldCaveatTexts.length === 4` | **delete** — strictly subsumed by the generic loop three lines above at `:197-201` | (survivor) return `caveatTexts.slice(0,1)` |
| `:180-183` | `monorepo-refactor.issues === '#1-#9'` | **delete** — subsumed by the generic `ISSUES_FORMAT` pass over all quests at `:169-177` | (survivor) emit `1-9` without the `#` |
| `:189-192` | `privacy-lfpdppp.issues === null && url === null` | **delete** — subsumed by the `!!q.issues !== !!q.url` parity check at `:170-173` | (survivor) build a url without issues |
| `:184-188` | exact `rls` caveatText string | loosen to *exists and >20 chars* — the pinned text itself says the fact is an owner-pending decision | return `caveatTexts: []` for that quest |
| `:127` | `FALLBACK_CASES` expects `'EXTRAORDIN'` | update to whatever the hardened splitter emits (`'EXTRAORDI.'`), add cases for the new boundaries | revert the splitter |

**`shortLabelFor` hardening (`viewmodel.mjs:167-180`) is required, not optional.** Area 5's Event B derived `'RESERVATIO'` for the subgroup *"Reservation truthfulness (open)"* — an 11-char first word hits the *sanctioned* single-overlong-word exception at `:172` and hard-clips mid-word. `check-viewmodel.mjs:56`'s `endsOnWordBoundary` explicitly allows it, so **no gate catches the exact artifact #176 was filed against** (`PROOF FIR` / `SALES MOTI` / `BRAND IDEN`). Fix: cut the name at its first `(` or `—` qualifier; split on `[\s\-\/]` not space alone (`MULTI-TENA` → `MULTI`, `SCALING/BA` → `SCALING`, `LAUNCH-HAR` → `LAUNCH`, `PER-COUNTR` → `PER`); if a single token still exceeds 10, clip to 9 + `.` so it reads as an abbreviation. Add a per-world dedup pass so uniqueness can never red on new data (today: 0 of 32 would collide under the pure fallback). Today's 32 labels are all overrides, so **nothing downstream moves.**

### `arcade/check-interior.mjs`

| line | pin | replacement | mutation |
|---|---|---|---|
| `:120` | `worlds.length === 7` | id-list equality: `JSON.stringify(worlds.map(w=>w.id)) === JSON.stringify(STATUS.model.worlds.map(w=>w.id))` — strictly stronger than a count (catches drop-one/dup-one that keeps the count) | swap two worlds in the derivation |
| `:102-105` | `idxs.length > 0`, `entryTile.walkIndex === lowest` | `d.entryTile === null` **iff** `d.questIds.length === 0`; keep the lowest-walkIndex assertion for non-empty districts | return `entryTile: null` for a populated district |
| — | *(new)* | every `tiles[].rect` fully inside 554×516 | this is the assertion whose absence let 70 quests clip to `y = −31` with **all six gates green** (Area 2, measured) |
| — | *(new)* | **growth battery**, composed like the existing `synthetic-walk` world: `1sg×1q`, `1×40`, `20×2`, `biome: undefined`, a 0-quest district, a 0-district realm | this battery *is* the machine proof of Ruling 1 for the interior; it reds the day a hand-keyed assumption returns |

### `arcade/check-overworld.mjs` — the false green

| line | pin | disposition |
|---|---|---|
| `:87`,`:94` | `sites.length === 7`, `bands.length === 7` | → `=== FROZEN.length`. **Hygiene only** — verified: the file contains no `status.js`/`STATUS`/`buildViewModel` token, so these never red on growth. |
| `:106-110` | `PLACED === 14`, `HIDDEN = 3` | **KEEP PINNED.** `HIDDEN` is emergent (how many braziers the composition happens to occlude) and cannot be derived. It belongs to the frozen-census parity block, which is exactly the right place for a frozen number. Do not generalise it. |
| — | *(new)* **LIVE ARM** over `status.js`: `sites.length === realms.length`, `bands.length === realms.length`, ids in model order, every rect in-canvas | **The single highest-value change in this design.** It is the assertion that would have caught Event C — the arcade dying on an 8th realm while its own gate printed 311 PASS. |
| — | *(new)* **GROWTH BLOCK**: compose `FROZEN + 1` synthetic realm; assert canvas 554×516, `sites.length === 8`, no band sliver, every channel rect ≤4096 px² with 2 frames, determinism on recompose | all already pass in Area 1's prototype; the block is a formality, but without it nothing stops the next hand-keyed table reappearing |
| — | *(new)* | `SPAN >= keepW + keepD` — fails loudly with a named number at the 12th realm rather than drawing a smear |

### `arcade/check-panels.mjs`

`:1407` interpolates every count **except** the realm count, which is the literal `'7 realms'`. It printed `all gates PASS — 7 realms, 34 PRD cards` on an 8-realm model. Cosmetic — and it sits on the exact line a reviewer trusts. → `${vm.worlds.length} realms`.

### `arcade/check-emit.mjs`

No growth pins. It reds on **any** `arcade/*.mjs` edit until `node gen-arcade.mjs` re-runs — regenerate as the last step of every task.

### The `CONTRACT.md` rule that stops the class returning

Insert directly under **Fidelity gates**:

> ### Gate discipline (GROWTH-1, 2026-07-30)
>
> A fidelity gate may assert exactly two kinds of thing:
> **(a) a byte/sha1 PARITY lock against a fixture FROZEN IN THE GATE FILE ITSELF** (or in a checked-in `data-*.json`) and never fed from `status.js` — legitimate forever, because the same input always yields the same output; or
> **(b) a JOB relation between two quantities BOTH derived from the current `status.js`** — true for any snapshot, at any size.
>
> **A gate must never assert a bare count or value against live `status.js`.** A quest total, a pct number, a beacons array, a realm count: if the number changes the day an issue closes, it is not a fidelity check, it is a stale snapshot, and it belongs nowhere. The literal `74 / 32 / 71-25-18-27-30-33-0` census this rule replaced was last true 2026-07-29.
>
> **Before adding any numeric literal to a `check-*.mjs` file, answer: does this number change when the project makes ordinary progress?** If yes, write the relation instead. If a relation is genuinely impossible (an emergent value like `HIDDEN`), it must live in the frozen-parity arm, never in a live arm.
>
> **Corollary — absence is a value.** When converting a hand-keyed table to derive-with-override, write the override map COMPLETE for every currently-authored key, including explicit falsy entries. `FLIPS` encoded four realms by omission; a hash fallback silently changed three of them and broke the pinned sha1.

Also amend: `CONTRACT.md:49` (`composeOverworld`'s pinned interface — arity widens to `>= 3`; the return shape is unchanged); `:68-71` (the per-realm biome enumeration becomes *overrides, not the domain*); `:81` (`554×516` restated as a derived-and-clamped property: *"554×516 for any realm count — seat latitude is clamped to the coast; single-column bands seat `castle-32` to 8 realms, `castle-24` to ~11"*).

---

## 5. The filing contract (Ruling 2)

### 5.1 Why compliance is 0/84

The binding convention was fully designed on 2026-07-14 (`docs/superpowers/wayfinder/2026-07-14-T2-scope-model-schema.md:132-137`) and **never wired into anything an agent reads while filing**. Area 4 grepped `quest|scope-model|binding` across `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, `CLAUDE.md`, `AGENTS.md`, and both the `to-spec` and `to-tickets` skills: five of six return nothing, the sixth matches only the word "re**quest**s". It is a wiring gap, not a design gap.

And the mechanism is mechanically broken on top of that. **Measured by me this session:** `docs/scope-model.yaml` declares 35 labels — 7 phase labels + 28 `quest:*`. `status.js`'s snapshot carries a per-issue label index of **20 distinct names** (`refresh.mjs:180` normalises labels to name strings; 172 of 179 issues carry at least one). **Zero of the 28 `quest:*` labels appear in it.** They do not exist on GitHub, and `gh` refuses to attach a label that does not exist — so even a perfectly compliant agent fails on first use. Meanwhile three *real* labels carrying 17 issues (`forge-client-branding-2026-07`, `single-email-activation-2026-07`, `loading-screens-2026-07`) are declared nowhere in the model and credit nothing.

### 5.2 The label-mechanics ruling: create-on-demand

**Adopt Area 4's `gh label create` at filing time. Reject Area 5's "bind by enumerated issue numbers to preserve the read-only-`gh` architecture."** The one-read-only-`gh`-call constraint governs `refresh.mjs` — the tracker's *build* step. The filing agent is already executing `gh issue create`, a write, as its entire purpose; `gh label create` costs nothing new. And enumerated issue numbers are disqualified by Ruling 1 on their own terms: every *later* issue joining that quest would need a second yaml touch — a hand edit on every growth event.

Rejected alternatives, with reasons:
- **Pre-create all 28 labels in a batch.** Speculative: many of those quests are `todo`/`needs-decision` and may go months without an issue. Create-on-demand means only labels actually used ever exist — self-healing exactly the ghost problem.
- **Switch the binding key to initiative labels.** Disqualified: `issue-tracker.md:24` mandates a *fresh* initiative label per effort, never reused. An evergreen quest (`security-hardening`, `billing-dunning`) accumulating issues across many future efforts has no stable initiative label. Making `github.label` an array would need a `viewmodel.mjs:203` + `refresh.mjs:186` change *and* still require a model edit per effort. **Quest labels and initiative labels answer different questions and both must exist.**

### 5.3 The text — insert into `docs/agents/issue-tracker.md` after line 24

> ## Quest binding (scope-model.yaml)
>
> Every issue you file gets bound to a quest in `docs/scope-model.yaml` (schema: `docs/superpowers/wayfinder/2026-07-14-T2-scope-model-schema.md`) **as part of filing it**, not as a later owner pass. Binding is a **different axis** from the initiative label above: an initiative label says *which planned effort produced this issue* (one per PRD/phase, never reused); a **quest label** (`quest:<slug>`, the quest block's `github.label`) says *which permanent capability bucket this issue belongs to*, and is reused for that quest's whole life. Most issues carry both. They do not compete.
>
> **1. Pick the quest.** Skim `docs/scope-model.yaml` for a quest whose `title`/`what` matches the issue's *capability*, not just its effort. Never add to a **frozen** quest (one whose `github.issues` is a closed `"N-M"` range) — that work is done; new work on that surface belongs to whichever active quest owns it now.
>
> **2. A quest fits — label it.** Take its `github.label`. If it isn't a real GitHub label yet (most `quest:*` labels aren't), create it first:
> ```
> gh label create "quest:<slug>" -d "<one line>" 2>/dev/null
> gh issue create --title "..." --body "..." --label "quest:<slug>"
> # existing issue: gh issue edit <n> --add-label "quest:<slug>"
> ```
>
> **3. Nothing fits — CREATE the quest, then tell the owner.** Do not propose and wait. Append a block to the closest-matching subgroup, or a new subgroup under an existing world if none fits. **Never a new world from this path** — a realm is a much larger claim than a quest, and the owner makes it.
>
> Minimum valid quest block:
> ```yaml
> - id: <kebab-slug>                    # globally unique — grep the file first
>   title: "<short title>"
>   what: "<one line — this is what your report says>"
>   github: { label: "quest:<kebab-slug>" }
> ```
> `id` + `title` + `github` is everything `refresh.mjs` requires. Use `github.label` **only** — never `github.issues` for the triggering issue. That field is how *frozen* quests work, and it is the one thing that can collide with another quest's issue range.
>
> **4. Self-validate before you call it done.** `node ../red-tracker/refresh.mjs --model docs/scope-model.yaml` and confirm `✓ model valid`. It catches a duplicate quest id, a missing required field, an unresolvable `depends_on`, and an issue number double-claimed across two ranges — and it **writes nothing on failure**, so a bad edit cannot corrupt the tracker, only leave the model red until fixed. It does **not** catch two quests reusing the same `quest:*` string: grep the file for your new label before committing.
>
> If another session is actively working in `red-tracker/`, skip the live regen (it would overwrite their `status.js`) and validate the YAML shape by eye.
>
> **If you cannot get the model to validate, do not commit it — file the issue unlabelled instead.** Unbound is a *visible* gap (it lands in the tracker's inbox); an invalid model is nothing rendering at all. Prefer the visible gap.
>
> **5. Report it.** One line in the changelog comment at the top of `docs/scope-model.yaml` — the convention that produced line 3's "18 gap quests added":
> `# 2026-08-03: quest <id> created — "<title>" (issue #187)`
> That line **is** the report. The owner reads it on the next diff. Nothing new to build.

### 5.4 How the tracker degrades rather than going dark

Four independent layers, in order of who catches it:

1. **`refresh.mjs` is safe-by-construction.** Every `die()` fires during the walk of `model.worlds` (~`:101-152`), strictly before the single `gh issue list` call and before `status.js` is touched; the write itself is temp-file-then-`rename`. A malformed yaml exits non-zero and leaves the previous good `status.js` untouched. **This property already exists — the contract just routes agents through it.**
2. **A ghost label degrades to an empty lot, never a crash.** Area 5 ran the exact shape: `model valid — 75 quests`, quest renders `tile: qt-todo`, `url: null`, `bar: null`, issues stay in the unmapped inbox. Visible, honest, non-fatal.
3. **A new gate turns 28 silent ghosts loud** (Area 5's D6.2, and I verified it is a *pure read* — `status.js` carries the label index): **every `github.label` declared in the model must appear in the snapshot's label index, or the quest must also enumerate issues.** No extra `gh` call, no write. This is what converts "credits nothing, silently" into one named failure.
4. **After the ÁRBOL panel ships, a ghost-label quest is doubly visible** — an empty quest row *and* its issues still sitting in the inbox. The owner sees the same issues twice, which is the correct signal.

**One residual gap I cannot close read-only:** `refresh.mjs:130-138` walks `q.github.issues` for its duplicate-binding guard and has **no equivalent map keyed on `q.github.label`**. Two quests declaring the same label silently double-count every issue carrying it. Fix is ~6 lines mirroring the existing `bindings` Map — assign it to whoever owns `refresh.mjs`.

**Free side effect, recommended in the same change:** backfill the 3 orphaned initiative labels as frozen quests (~5 lines each, using the proven dual-purpose pattern already on the 7 real phase labels), reclaiming 17 shipped issues that currently render zero credit:
```yaml
- id: forge-branding
  title: "Forge client branding + demo seed"
  github: { issues: [84,85,86,87,"90-95"], label: forge-client-branding-2026-07 }
```

---

## 6. Acceptance criteria — what must be TRUE after the build

Area 5's measured event × file × outcome table, restated as post-build obligations. Method for re-verifying: copy `red-tracker` to a scratch dir, use `refresh.mjs`'s own source with only the single `gh` call stubbed by the frozen issue snapshot, make three real YAML edits, run all six gates per event. **Never write to the live `red-tracker/`.**

### Event A — a quest is added to an existing subgroup
1. `refresh.mjs` prints `model valid — 75 quests across 7 worlds`; `status.js` regenerates.
2. `index.html` renders 75 quest rows, correct rollups. *(true today)*
3. `viewmodel` derives the quest with `tile: qt-todo`, resolved `url`, and its open issues on the correct wait axis. *(true today)*
4. `interior.mjs` composes the owning realm; `tilesUnderChrome === 0`; every tile rect inside 554×516.
5. **All six gates green with zero gate edits.** Today: `check-viewmodel` exits 1 with `quest-total: expected 74, got 75` and `realm-pct: realm[0] (foundation): expected 71, got 67`. **The second message is the gate asserting that the project has not progressed. It must be impossible to write again.**

### Event B — a new subgroup is added to a realm
1–4 as above, at 33 subgroups / 75 quests.
5. The derived `shortLabel` for *"Reservation truthfulness (open)"* is **not** a mid-word clip. `RESERVATIO` is a fail; `RESERVA.` or `RESERVATION` truncated on a real boundary is a pass.
6. **All six gates green with zero gate edits and zero `SHORT_OVERRIDES` entry added.** Today: 5 failures, including `shortlabel-overrides-coverage: SHORT_OVERRIDES has 32 entries, today's status.js has 33 subgroups` — a **mandatory hand edit on every growth event**, and one `CONTRACT.md:76-77` never demanded (it calls the map OVERRIDES).

### Event C — an 8th realm is added
1. `refresh.mjs` prints `model valid — 77 quests across 8 worlds`.
2. `index.html` renders 8 panels, 34 headings, 77 rows, subline "as 8 realms". *(true today)*
3. **`composeOverworld` does not throw.** Today: `shell.mjs:332 → overworld.mjs:853`, `composeOverworld: expected 7 realms, got 8` — and because there is no try/catch, the owner sees a `#14142a` page, a blank 554×516 canvas and the corner link. **No map, no error message.** (`index.html` by contrast ships a friendly "No snapshot yet" card at `:484-493`.)
4. **The 8th realm has pixels.** Non-negotiable: Area 5 relaxed all four crash guards and the 8-realm map rendered **byte-identical** to the 7-realm map (`4574bb24cea289bed352a46c6a37b228eaa3fd37` both) — every loop iterates `JOURNEY`/`MAINLAND`, never the `realms` argument. **`JOURNEY` is not a guard; it is the map's entire data source.** Assert: `sites.length === 8`, `bands.length === 8`, the new realm's id present in both.
5. Canvas stays **554×516**; no band sliver; every channel rect ≤4096 px² with 2 frames; recompose is byte-identical.
6. The new realm is **reactive**: pct 0 vs 12 produce different rasters (fog burn tracks it); 1 brazier produces an animated beacon channel; pct 100 produces a flag channel.
7. The new realm's biome is **not** Foundation's. Assert `vm.worlds[7].biome !== vm.worlds[0].biome`.
8. `realm.label` is a non-empty string. The page aria-label contains no `undefined`.
9. `interior.mjs` composes it; the plaque reads its name; `tilesUnderChrome === 0`. *(true today)*
10. `panels.mjs` builds 34 cards / 77 popups; the `check-panels` verdict line says **8 realms**, not 7.
11. `shell.mjs` boots to a painted map with a live panel.
12. **All six gates green with zero gate edits.** And critically: `check-overworld`'s new live arm **must be capable of failing** — verify by deleting the new realm from `JOURNEY` and confirming it reds. Today it prints 311 PASS on this exact model.

### Event D — an agent creates a quest and reports (Ruling 2, end to end)
1. Agent files an issue, finds no fitting quest, appends a 4-line block with `github.label` only.
2. `gh label create` succeeds; the label attaches to the issue.
3. `refresh.mjs` validates; on next regen the quest resolves the issue, the bar moves, the issue **leaves the inbox**.
4. One changelog line lands at the top of `docs/scope-model.yaml`.
5. **No gate reds.** No human touched a `check-*.mjs`, `overworld.mjs`, or `SHORT_OVERRIDES`.

---

## 7. Build order

Each step names what it unblocks and whether it collides with the ÁRBOL panel work already in flight (`PLAN-panel-arbol.md`, currently past Task 3 — its Global Constraints block carries a "Corrected 2026-07-30 after the Task 3 review" note).

**The panel plan's file set is: `viewmodel.mjs`, `check-viewmodel.mjs`, `check-interior.mjs`, `panels.mjs`, `check-panels.mjs`, `shell.mjs`, `CONTRACT.md`. It does NOT touch `overworld.mjs`, `check-overworld.mjs`, `interior.mjs`, or `index.html`.**

| # | step | files | unblocks | vs. panel work |
|---|---|---|---|---|
| **S0** | Land the **gate-discipline rule** in `CONTRACT.md` and migrate `check-viewmodel.mjs`'s 6 census pins + 3 redundant content pins + the shortlabel-coverage RAISEs (§4) | `check-viewmodel.mjs`, `CONTRACT.md` | **Everything.** Ruling 2 is impossible before this: the first agent-created quest reds the build. Also unblocks Events A and B entirely. | ⚠ **HARD COLLISION** — panel Task 1 edits both. **Sequence after the panel plan completes, or fold into panel Task 1.** Do not run concurrently. |
| **S1** | `viewmodel.mjs` fallbacks: `biome` season-ring, `label`, hardened `shortLabelFor`, `beacons` → `i !== 0` | `viewmodel.mjs`, `check-viewmodel.mjs` | Event B's label quality; Event C's items 7–8 | ⚠ **HARD COLLISION** — same file as panel Task 1. Sequence after. |
| **S2** | `overworld.mjs` **`layout()` derivation** — banks, COMPLETE overrides (the FLIPS trap), coast clamp, keep auto-downgrade, the 9 remaining id literals | `overworld.mjs` | Event C items 3–6. **This is the ruling's core.** | ✅ **FULLY INDEPENDENT.** Can run in parallel with the panel work. Prototype already built and gate-verified. |
| **S3** | `check-overworld.mjs` — **live arm** + **growth block** + `FROZEN.length` hygiene + the `SPAN >= w+d` ceiling assertion | `check-overworld.mjs` | Makes S2 provable; closes the false green | ✅ independent |
| **S4** | `interior.mjs` crash guards (6 lines) + `check-interior.mjs` growth battery + in-frame rect assertion | `interior.mjs`, `check-interior.mjs` | Ruling 2's empty-district / district-less-realm shapes | ⚠ `check-interior.mjs` is on the panel plan's list (road-order assertion). `interior.mjs` itself is not. Low collision — coordinate on the gate file only. |
| **S5** | `index.html:724-726` → three positional lines | `index.html` | Event C's tag correctness in the expedition skin | ✅ independent, **but `index.html` is on the arcade agents' Never-touch list (`CONTRACT.md:6-11`) — needs an explicit exemption or a non-arcade agent** |
| **S6** | RED-2.0 side: the filing-contract text (§5.3), the ghost-label gate, the `refresh.mjs` label-collision guard, backfill the 3 orphaned initiative labels | `docs/agents/issue-tracker.md`, `docs/scope-model.yaml`, `refresh.mjs`, `check-viewmodel.mjs` | Ruling 2, end to end (Event D) | ✅ independent of the panel work; **depends on S0** (until S0 lands, a compliant agent reds the build) |
| **S7** | `node gen-arcade.mjs` + all six gates + a visual walk of the 7 existing realms | — | ship | last step always |

**Smallest useful subset if the session runs short:** S0 alone converts the tracker from *punishing progress* to *absorbing it* for quests and issues — which is 100% of the growth events that will actually happen this quarter. S2+S3 are the realm story, and realm #8 is not imminent. **S0 first.**

---

## 8. What this does NOT fix

**This is a growth design. It is not a usefulness fix, and it must not be mistaken for one.**

- **74 quests is still not a queue.** The cross-examination's arithmetic stands: 17 open issues ÷ 74 quests = **0.22 open issues per quest**. Binding every issue perfectly still leaves 74 rows of which ~15 have anything actionable. Mapping is a *precondition* for a useful queue, never a substitute. The ÁRBOL panel's inbox + wait-axis filters (`PLAN-panel-arbol.md` Task 1: `q.openIssues`, `vm.inbox`, `wait: 'OWNER'|'AGENT'|'TRIAGE'`) is the actual usefulness work. **Do not report GROWTH-1 as an answer to the #176 walk failure.**
- **Realm capacity above ~12.** The 554×516 canvas cannot grow. Realm 13 needs a two-column band model, which changes how the journey *reads*. Undesigned, and it needs an owner ruling before anyone builds it.
- **Interior crowding.** A realm's road has a fixed 354-unit v-budget (`interior.mjs:491-492`); a tile is ~44 units tall on screen; the frame holds ~8 collision-free clearings and **foundation already has 10**. Area 2's capacity-aware layout (I2) is **deliberately out of scope** — it changes the live look of all 7 existing realms and nothing pins them, so it is an owner-walk change, not a growth change. §9/C5.
- **Hit-test honesty.** `shell.mjs:834` hit-tests an axis-aligned bbox around a diamond sprite; Area 2 measured **up to 41% of a foundation tile's hit rect already resolving to a different quest** (55% on sellable-product, 100% at 62 quests). That is a *tactical* defect — hover points at the wrong quest — and it gets worse with density. It is its own issue, not this one.
- **The 16 unmapped issues.** GROWTH-1 makes *future* issues bindable. It does not bind the existing backlog; that is a content pass on `scope-model.yaml`.
- **`quest:*` label creation cannot be retroactive.** 28 ghost labels stay ghosts until an agent actually files against each quest. The new gate makes them *loud*, not *real*.
- **Nothing here makes the map easier to read at a glance.** More realms means more to scan.

---

## 9. Contradictions between areas — ruled, not averaged

| # | contradiction | ruling |
|---|---|---|
| **C1** | G4 and Area 1 treat `check-overworld.mjs:87/:94` as growth-red pins; Areas 3 and 5 measured that the file never reads `status.js`. | **Areas 3/5. Verified independently by me:** zero `status.js`/`STATUS`/`buildViewModel` tokens in the file; it drives `FROZEN` (`:22-30`). The pins are fixture parity and **stay**; convert to `FROZEN.length` as hygiene only. The real defect is the inverse — a false green on the one gate covering the only realm-hardcoded renderer. **This raises S3's priority above where any single area placed it.** |
| **C2** | Biome for an unknown realm: Area 1's journey-index ring `KIT_BANK[i%6]`; Area 5's 180-kit hash recombination; Area 2's `hashStr(id)%6`. | **Area 1's ring.** It reproduces all 7 authored rows with **zero overrides** (verified: `:52` is `:44` verbatim); it *guarantees* adjacent realms never share a ground tone, which a hash cannot; it preserves the seasonal arc that makes the journey read as a journey; and it sidesteps Area 5's own `WARM2FOG` hazard entirely — I confirmed `overworld.mjs:154` carries `floweryellow` but `interior.mjs`'s `WARM2FOG` (`:108-121`) does not, so recombination would need a new gate the ring makes unnecessary. **Additionally overruling Area 1's own lap-≥1 stripe re-pick** — it is the one part of the prototype that leaves the authored kit set for negligible differentiation. Keep the ±25% density jitter; drop the stripe jitter. |
| **C3** | Area 5 proposes `census.lock.json` + an explicit `relock-census.mjs`; Area 3 proposes pure JOB relations with no pinned numbers. | **Area 3.** A lockfile regenerated on every growth event **is a gate edit with extra steps** — precisely what Ruling 1 forbids. Area 3's relations (`pct === round(earned/total*100)`, `beacons === count(shipped)`, `caveats === passthrough`) catch derivation bugs, which is what #176's drift detection actually wants, without asserting that the project hasn't progressed. |
| **C4** | Area 4: create the label on demand (`gh label create`). Area 5: bind by enumerated issue numbers, because a `gh` write violates the read-only architecture. | **Area 4.** The one-read-only-`gh`-call constraint governs `refresh.mjs`, the *build* step. A filing agent already runs `gh issue create` — a write — as its whole purpose. Enumerated issue numbers additionally fail Ruling 1: every later issue joining the quest needs a second yaml touch. **Adopt Area 5's ghost-label gate as the backstop** — verified a pure read (`refresh.mjs:180`, 20-name index in today's snapshot, 0 `quest:*`). |
| **C5** | Area 2: interior ceiling ~8 clearings, foundation already at 10, tiles clip silently at 70 quests with all gates green. Area 5: clean through 100 quests, first failure at 200. | **Both measured, different predicates.** Area 2 measured tile *rects* and rect-overlap; Area 5 measured gate-visible failures (sign in-frame, chrome overlap, throw). **Ruling: Area 2's I1 crash guards are IN (6 lines, provably parity-safe). I2 capacity-aware layout is OUT — it changes the live look of all 7 realms with nothing pinning them; that is an owner-walk change. I3 hitPoly is OUT — a tactical fix, not a growth fix.** Both get their own issues. Adopt Area 2's in-frame rect assertion **now** regardless — it is what makes the silent clipping loud. |
| **C6** | Island semantics: Area 1 derives island = last in journey (demotes latam when an 8th realm appends); Area 5 calls it an unmade product call; both float an `island: true` yaml key. | **Positional-last, no new key.** Ordering in `scope-model.yaml` is *already* the owner's authoring surface — a realm that must stay overseas is ordered last, using data they already control. A new key is a second authoring surface for a fact the first one already carries, and it violates the letter of Ruling 1. Name the consequence loudly in `CONTRACT.md`: **appending after `latam-expansion` moves LatAm onto the mainland.** If the first real growth event proves this wrong, the key is a one-word escape hatch — but do not build it speculatively. |
| **C7** | Area 3 wants a new gate asserting model-order === `MAINLAND`-order; Area 1 derives the order from the `realms` argument. | **Area 1 — eliminate, don't gate.** Deriving `JOURNEY` from the argument makes order true by construction. Consequently **delete the per-index order guard at `overworld.mjs:855-859`**; keep only `realms.length < 3`. |
| **C8** | shortLabel: Area 2 hardens the fallback splitter and deletes the coverage RAISE; Area 5 adds an optional `short:` field to `scope-model.yaml`. | **Area 2.** `SHORT_OVERRIDES` already *is* the override layer and it is one line; a yaml field is a second override layer for the same fact, and it needs `refresh.mjs` + `viewmodel.mjs` changes. Hardening the fallback is mandatory under Ruling 1 (no hand edit on growth); the new field is not. |
| **C9** | The brief's G2 lists `PASS` (`:317-323`) as a hand-keyed table. | **Area 1's correction stands.** `:317-323` is `SEAT_UV`. `PASS` is declared empty at `:400` and filled by a loop at `:401-407` — already repeatable for any *n*. "The path as a repeatable" is roughly two-thirds already true. |
| **C10** | The brief's G7 states `arcade.html` is 292.6 KB. | **Measured: 314,554 B on disk; 318,770 B on a fresh emit** (the concurrent session's module edits are not yet emitted, which is why `check-emit` is currently the one red gate). Headroom against 614,400 B: **295,630 B**. Area 1's refactor costs +1,513 B = 0.5% of headroom. |

---

## 10. Decisions the owner must make (I am not ruling these)

1. **Adding a mainland realm re-lays the whole map** — every border shifts, every keep moves, the road re-walks (band height = 384/*m*). This happens **only** on realm add/remove, never on a quest or issue. Acceptable, or should existing realms hold their latitude and the newcomer squeeze in? (Holding latitudes produces uneven bands, which reads as sloppy.)
2. **Is ~12 realms enough runway for the project's lifetime?** Beyond it, the two-column band model is the next move and it changes how the journey reads.
3. **`LAKES`/`MASSIFS` (`overworld.mjs:342-351`) are absolute geography** and do not move when bands re-lay, so a re-lay changes which realm owns which lake. The module comment calls this intended, but Foundation's lake was clearly placed *relative to Foundation*.
4. **Should an agent that may create a quest also be able to create a realm?** My contract text says **quest yes, realm no** — a realm is a much larger claim, and `scope-model.yaml` has 2 commits in its entire history. Confirm or overrule.
5. **Backfill the 3 orphaned initiative labels in the same change, or a separate housekeeping pass?** ~15 lines, free, reclaims 17 shipped issues' credit — but it is a content edit, not a contract edit.
6. **Who owns `refresh.mjs`'s missing label-collision guard?** ~6 lines mirroring the existing issue-number `bindings` Map. Until it lands, the contract substitutes a manual grep, which is weaker.

---

## 11. File index (all absolute)

**Tracker** — `C:/Users/Aaron/Documents/Repos/red-tracker/`: `arcade/overworld.mjs` (S2), `arcade/check-overworld.mjs` (S3), `arcade/viewmodel.mjs` (S1), `arcade/check-viewmodel.mjs` (S0/S1), `arcade/interior.mjs` + `arcade/check-interior.mjs` (S4), `arcade/check-panels.mjs:1407` (S0), `arcade/CONTRACT.md` (S0), `index.html:724-726` (S5), `gen-arcade.mjs` (S7), `refresh.mjs:130-138` (S6).

**Project** — `C:/Users/Aaron/Documents/Repos/RED-2.0/`: `docs/agents/issue-tracker.md` (insert after line 24), `docs/scope-model.yaml` (backfill + changelog convention), `docs/superpowers/wayfinder/2026-07-14-T2-scope-model-schema.md` (the schema the contract cites).

**Prototype (rescue before it is GC'd)** — `C:/Users/Aaron/AppData/Local/Temp/claude/C--Users-Aaron-Documents-Repos-RED-2-0/5e4d8dc2-3943-4a94-84d0-c1cb37cf1fb1/scratchpad/{ow-derived.mjs, ow-base.mjs, patch.cjs, gate-derived.mjs}`.

**Gate command:** `cd /c/Users/Aaron/Documents/Repos/red-tracker && node gen-arcade.mjs && for c in viewmodel interior overworld panels shell emit; do node arcade/check-$c.mjs || echo "GATE FAILED: $c"; done`