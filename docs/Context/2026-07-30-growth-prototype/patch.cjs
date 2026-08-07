const fs = require('fs')
let s = fs.readFileSync('ow-base.mjs', 'utf8')
let n = 0
const rep = (a, b, tag) => {
  if (!s.includes(a)) throw new Error('MISS: ' + tag)
  s = s.replace(a, b); n++
}

// ---------- 1. tables -> banks + layout state ----------
const OLD_TABLES = s.slice(s.indexOf('// biome kit per realm'), s.indexOf('// ============================================================ vox utilities'))
rep(OLD_TABLES, `// ---- BANKS: the hand-tuned art, re-expressed as journey-indexed rings ----
const KIT_BANK = [
  ['grass', 'grass2', 'orchard', 'orchard2', 'farmcoral'],
  ['springgrass', 'springgrass2', 'springtree', 'springtree2', 'flowerwhite'],
  ['autumngrass', 'autumngrass2', 'autumntree', 'autumntree2', 'dirt'],
  ['taigagrass', 'taigagrass2', 'pine', 'pine2', 'stone'],
  ['harvestgrass', 'harvestgrass2', 'olive', 'olive2', 'sand'],
  ['mistgrass', 'mistgrass2', 'mistytree', 'mistytree2', 'stone'],
]
const DENSITY_BANK = [
  [1.00, 1.30, false], [1.05, 0.55, true], [1.45, 0.35, false],
  [1.70, 0.15, false], [0.45, 2.10, false], [0.90, 0.45, true],
]
const STRIPE_RING = ['farmcoral', 'flowerwhite', 'floweryellow', 'dirt', 'stone', 'sand']
const U_SEAT = {
  foundation: 62, 'sellable-product': -48, monetization: 44, 'growth-reach': -66,
  'go-to-market': 38, 'customer-support': -52, 'latam-expansion': 10,
}
const FLIP_OVERRIDE = {
  foundation: false, 'sellable-product': false, monetization: true, 'growth-reach': false,
  'go-to-market': true, 'customer-support': true, 'latam-expansion': false,
}
const KEEP_SIZE = { 'castle-32': [30, 20], 'castle-24': [21, 14] }

function hashId(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return h
}
let JOURNEY = [], MAINLAND = [], BORDERS = [], SEAT_UV = {}, FLIPS = {}
let KIT = [], DEN = [], SPAN = 64, KEEPCLASS = {}
`, 'tables')

// ---------- 2. band borders derived ----------
rep(`const BORDERS = [418, 354, 290, 226, 162]
const borderV = (i, u) =>
  BORDERS[i] + 11 * Math.sin(u / 29 + i * 1.7) + 5 * Math.sin(u / 11 + i * 3.1)

const MAINLAND = ['foundation', 'sellable-product', 'monetization', 'growth-reach', 'go-to-market', 'customer-support']
const JOURNEY = [...MAINLAND, 'latam-expansion']`,
`const VLAND0 = 98
const borderV = (i, u) => {
  const k = SPAN / 64
  return BORDERS[i] + 11 * k * Math.sin(u / 29 + i * 1.7) + 5 * k * Math.sin(u / 11 + i * 3.1)
}`, 'borders')

rep(`  if (v < chanN(u)) return 'latam-expansion'
  if (v <= chanS(u)) return null // water
  for (let i = 0; i < BORDERS.length; i++) if (v >= borderV(i, u)) return MAINLAND[i]
  return 'customer-support'`,
`  if (v < chanN(u)) return JOURNEY[JOURNEY.length - 1]
  if (v <= chanS(u)) return null // water
  for (let i = 0; i < BORDERS.length; i++) if (v >= borderV(i, u)) return MAINLAND[i]
  return MAINLAND[MAINLAND.length - 1]`, 'bandAt')

// ---------- 3. seats derived ----------
const OLD_SEAT = s.slice(s.indexOf('// keep seats as (u, v) of the model footprint CENTRE'), s.indexOf('/** grid seat of a w x d model'))
rep(OLD_SEAT, `function layout(ids) {
  JOURNEY = ids.slice()
  MAINLAND = ids.slice(0, -1)
  const m = MAINLAND.length
  SPAN = (V1 - VLAND0) / m
  BORDERS = []
  for (let i = 0; i < m - 1; i++) BORDERS.push(V1 - (i + 1) * SPAN)
  KIT = []; DEN = []; SEAT_UV = {}; FLIPS = {}; KEEPCLASS = {}
  ids.forEach((id, i) => {
    const island = i === ids.length - 1
    const k = KIT_BANK[i % KIT_BANK.length]
    KIT.push(i < KIT_BANK.length
      ? k
      : [k[0], k[1], k[2], k[3], STRIPE_RING[hashId(id) % STRIPE_RING.length]])
    const d = DENSITY_BANK[i % DENSITY_BANK.length]
    DEN.push(i < DENSITY_BANK.length
      ? d
      : [d[0] * (0.75 + 0.5 * rnd(hashId(id), i, 41)),
         d[1] * (0.75 + 0.5 * rnd(hashId(id), i, 42)),
         rnd(hashId(id), i, 43) < 0.33])
    const fits = (c) => KEEP_SIZE[c][0] + KEEP_SIZE[c][1] + 4 <= SPAN
    KEEPCLASS[id] = island || !fits('castle-32') ? 'castle-24' : 'castle-32'
    const u = id in U_SEAT ? U_SEAT[id] : seatFallbackU(id, i)
    const ext = KEEP_SIZE[KEEPCLASS[id]][0] + KEEP_SIZE[KEEPCLASS[id]][1] - 2
    const v = island
      ? Math.round(chanN(u) / 2 + 2)
      : Math.round(Math.min(V1 - (i + 1) * SPAN + SPAN / 2 - 2, vMaxAt(u) - ext / 2 - 4))
    SEAT_UV[id] = [u, v]
    FLIPS[id] = id in FLIP_OVERRIDE ? FLIP_OVERRIDE[id] : rnd(hashId(id), i, 55) < 0.5
  })
}
function seatFallbackU(id, i) {
  const side = i % 2 ? -1 : 1
  const base = 38 + Math.round(28 * rnd(hashId(id), i, 77))
  const vv = Math.round(V1 - (i + 1) * SPAN + SPAN / 2 - 2)
  for (let t = 0; t < 10; t++) {
    const u = side * Math.max(14, base - t * 6)
    if (seatClear(u, vv)) return u
  }
  return side * base
}
function seatClear(u, v) {
  const r = 26
  for (const du of [-r, 0, r]) {
    for (const dv of [-r, 0, r]) {
      const uu = u + du, vv = v + dv
      if (uu < uMinAt(vv) + 3 || uu > uMaxAt(vv) - 3) return false
      if (vv < vMinAt(uu) + 3 || vv > vMaxAt(uu) - 3) return false
      for (const [cu, cv, ru, rv] of LAKES) {
        if (((uu - cu) / (ru + 4)) ** 2 + ((vv - cv) / (rv + 4)) ** 2 < 1) return false
      }
    }
  }
  return true
}
const seatWD = (id) => KEEP_SIZE[KEEPCLASS[id]]
`, 'seats')

// ---------- 4. road origin ----------
rep(`  const waypoints = [[104, 476], doorUV('foundation')]`,
    `  const waypoints = [[SEAT_UV[MAINLAND[0]][0] + 42, V1 - 6], doorUV(MAINLAND[0])]`, 'waypoints')
rep(`    const origin = id === 'foundation' ? doorUV('foundation') : PASS[id]`,
    `    const origin = id === MAINLAND[0] ? doorUV(MAINLAND[0]) : PASS[id]`, 'origin')

// ---------- 5. kit/density read sites ----------
rep(`      TOP[i] = BIOME[JOURNEY[BAND[i] - 1]][0]`, `      TOP[i] = KIT[BAND[i] - 1][0]`, 'top')
rep(`      const kit = BIOME[JOURNEY[BAND[i] - 1]]`, `      const kit = KIT[BAND[i] - 1]`, 'dapple')
rep(`    const kit = BIOME[id]
    const [treeBias, fieldBias, hasFlowers] = DENSITY[id]`,
    `    const kit = KIT[JOURNEY.indexOf(id)]
    const [treeBias, fieldBias, hasFlowers] = DEN[JOURNEY.indexOf(id)]`, 'kitden')

// ---------- 6. remaining id literals ----------
rep(`        const kind = id === 'growth-reach'`, `        const kind = kit[2] === 'pine'`, 'conifer')
rep(`      const model = castle.MODELS[id === 'latam-expansion' ? 'castle-24' : 'castle-32']`,
    `      const model = castle.MODELS[KEEPCLASS[id]]`, 'keepmodel')
rep(`    } else if (id === 'latam-expansion') {`, `    } else if (KEEPCLASS[id] === 'castle-24') {`, 'sealed24')
rep(`    const deep = id === 'latam-expansion' ? 0.93 : 0.5
    const r = id === 'latam-expansion' ? 32 : 30`,
    `    const deep = realmOf(id).pct === 0 ? 0.93 : 0.5
    const r = realmOf(id).pct === 0 ? 32 : 30`, 'punch')
rep(`    const [csx, csy, cw, cd] = seats['customer-support']
    const [lsx, lsy, lw, ld] = seats['latam-expansion']`,
    `    const [csx, csy, cw, cd] = seats[JOURNEY[JOURNEY.length - 2]]
    const [lsx, lsy, lw, ld] = seats[JOURNEY[JOURNEY.length - 1]]`, 'dashes')
rep(`(id === 'latam-expansion' ? 15 : 3)`, `(KEEPCLASS[id] === 'castle-24' ? 15 : 3)`, 'chip')

// ---------- 7. arity guard -> layout ----------
const OLD_GUARD = s.slice(s.indexOf('  const parity = opts.draftParity === true'), s.indexOf('  const realmOf = (id) ='))
rep(OLD_GUARD, `  const parity = opts.draftParity === true
  if (!Array.isArray(realms) || realms.length < 3) {
    throw new Error('composeOverworld: need at least 3 realms')
  }
  layout(realms.map((r) => r.id))
`, 'guard')

fs.writeFileSync('ow-derived.mjs', s)
console.log(n + ' replacements applied')
