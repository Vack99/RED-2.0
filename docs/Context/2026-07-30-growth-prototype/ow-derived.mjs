// arcade/overworld.mjs — the production port of proto-a4-continent/gen-continent-f.mjs
// ("EL MUNDO", draft F, approved #157). The canonical generator stays untouched;
// this module is what arcade.html composes at runtime.
//
// WHAT CHANGED vs the generator (nothing else did — draftParity is byte-exact):
//   · the A1 census is an ARGUMENT (`realms`), not a hardcoded table
//   · live mode bakes NO marker; it returns a marker SPRITE pair + per-realm anchors
//   · a realm at pct===100 seats its castle ALIVE with the flag raised
//   · the two moving things (brazier flame tip, castle pennant tip) are NOT baked
//     as animation — they ride `channels` (see § CHANNELS below)
//
// § CHANNELS — how the 2-frame art is built without a second full-scene render.
//   Rule: BAKE THE INVARIANT, ANIMATE THE VARIANT.
//   A channel frame is an OPAQUE crop of the finished f0 raster with one tiny
//   standalone Vox render blitted on top, so frame0 is pixel-identical to the
//   baked raster everywhere except the few voxels that actually move — there is
//   no rectangle edge to see, because the rect's border pixels ARE the raster's.
//   · beacon: the brazier's crimson flame body is baked; the dancing tip +
//     gold spark (questtile.mjs `qt-beacon` grammar, z+6) are the two frames.
//   · flag:   castle-32's two build frames differ only in the pennant tip, so the
//     cells that differ are DIFFED OUT of the baked keep and supplied per frame.
//     Derived from the model, not hardcoded — a 1-frame keep (castle-24) simply
//     gets no flag channel.
//   Placement is exact, not eyeballed: a small render's canvas bounds are
//   predicted by isoFrame(), so the sub-render's origin maps onto the world
//   frame by pure integer translation (asserted at compose time).
//
// SK shear law (questtile.mjs header): honoured by not authoring any new plate,
// bar or glyph — every voxel here comes from an existing model or the draft's
// own terrain grammar (masses, which take no SK).
//
// No node: imports, no Date.now/Math.random, no default export.

import { Pix } from 'file:///C:/Users/Aaron/Documents/Repos/red-tracker/proto-a2-tileset/lib/pixel.mjs'
import { FONT, drawText } from 'file:///C:/Users/Aaron/Documents/Repos/red-tracker/proto-a2-tileset/tiles/ui.mjs'
import { MATS, SHADE, CAMS } from 'file:///C:/Users/Aaron/Documents/Repos/red-tracker/proto-b1-voxel/voxpalette.mjs'
import { Vox } from 'file:///C:/Users/Aaron/Documents/Repos/red-tracker/proto-b1-voxel/vox/voxel.mjs'
import { renderVox, mix } from 'file:///C:/Users/Aaron/Documents/Repos/red-tracker/proto-b1-voxel/vox/render.mjs'
import * as castle from 'file:///C:/Users/Aaron/Documents/Repos/red-tracker/proto-b1-voxel/models/castle.mjs'
import * as marker from 'file:///C:/Users/Aaron/Documents/Repos/red-tracker/proto-b1-voxel/models/marker.mjs'

// ---- BANKS: the hand-tuned art, re-expressed as journey-indexed rings ----
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
// ============================================================ vox utilities

function mergeVox(dst, src, ox, oy, oz) {
  for (let z = 0; z < src.nz; z++) {
    for (let y = 0; y < src.ny; y++) {
      for (let x = 0; x < src.nx; x++) {
        const k = src.get(x, y, z)
        if (k !== null) dst.set(x + ox, y + oy, z + oz, k)
      }
    }
  }
  return dst
}

function remapVox(src, table) {
  const out = new Vox(src.nx, src.ny, src.nz)
  for (let z = 0; z < src.nz; z++) {
    for (let y = 0; y < src.ny; y++) {
      for (let x = 0; x < src.nx; x++) {
        const k = src.get(x, y, z)
        if (k === null) continue
        const m = k in table ? table[k] : k
        if (m !== null) out.set(x, y, z, m)
      }
    }
  }
  return out
}

function flipVox(src) {
  const out = new Vox(src.nx, src.ny, src.nz)
  for (let z = 0; z < src.nz; z++) {
    for (let y = 0; y < src.ny; y++) {
      for (let x = 0; x < src.nx; x++) {
        const k = src.get(x, y, z)
        if (k !== null) out.set(src.nx - 1 - x, y, z, k)
      }
    }
  }
  return out
}

/** highest z holding a cell, -1 if empty */
function maxZOf(vox) {
  for (let z = vox.nz - 1; z >= 0; z--) {
    for (let y = 0; y < vox.ny; y++) {
      for (let x = 0; x < vox.nx; x++) if (vox.get(x, y, z) !== null) return z
    }
  }
  return -1
}

/** cells where two frames of one model disagree; CLEARS them out of `a` so the
 *  baked keep carries only the invariant core. -> { c0, c1 } | null */
function variantCells(a, b) {
  const c0 = []
  const c1 = []
  for (let z = 0; z < a.nz; z++) {
    for (let y = 0; y < a.ny; y++) {
      for (let x = 0; x < a.nx; x++) {
        const ka = a.get(x, y, z)
        const kb = b.get(x, y, z)
        if (ka === kb) continue
        if (ka !== null) c0.push([x, y, z, ka])
        if (kb !== null) c1.push([x, y, z, kb])
        a.set(x, y, z, null)
      }
    }
  }
  return c0.length || c1.length ? { c0, c1 } : null
}

// castle-24 pushed onto the fog axis (castle.mjs SEALED table, restated)
const SEAL24 = {
  wall: 'foglight', wall2: 'fogmid', roof: 'fogmid', roof2: 'fogdeep',
  stone: 'fogmid', path: 'fogmid', windowdk: 'fogdeep', windowlit: 'fogdeep',
  door: 'fogdeep', flagpole: null, flag: null,
}

// warm ground -> fog axis. Base tones all collapse to the COOL fogdirt (at map
// scale a green-ish fog base still reads "owned"); dapples keep a sage tell so
// the fog is textured, not flat.
const WARM2FOG = {
  grass: 'fogdirt', grass2: 'foggrass',
  springgrass: 'fogdirt', springgrass2: 'foggrass',
  autumngrass: 'fogdirt', autumngrass2: 'foggrass',
  taigagrass: 'fogdirt', taigagrass2: 'foggrass',
  harvestgrass: 'fogdirt', harvestgrass2: 'foggrass',
  mistgrass: 'fogdirt', mistgrass2: 'foggrass',
  farmcoral: 'fogdirt', flowerwhite: 'foggrass', floweryellow: 'foggrass',
  dirt: 'fogdirt', dirt2: 'fogdirt', stone: 'fogmid', path: 'foglight', sand: 'fogdirt',
  water: 'fogwater', waterlt: 'fogwaterlt',
}

/** earned-ahead brazier — stone base, stem, bowl, crimson flame */
function brazier(vox, x, y, zTop) {
  vox.box(x, y, zTop + 1, 2, 2, 1, 'stone')
  vox.set(x, y, zTop + 2, 'flagpole')
  vox.set(x + 1, y + 1, zTop + 2, 'flagpole')
  vox.box(x, y, zTop + 3, 2, 2, 1, 'wall2')
  vox.box(x, y, zTop + 4, 2, 2, 2, 'flag')
}

/** cottage lump — cribbed from models/questtile.mjs house(), shrunk to 3x3 */
function hut(v, x, y, zt, rot) {
  v.box(x, y, zt + 1, 3, 3, 2, 'wall')
  v.set(x + 1, y + 2, zt + 1, 'door')
  if (rot) v.set(x + 2, y + 1, zt + 2, 'windowdk')
  v.box(x - 1, y - 1, zt + 3, 5, 5, 1, 'roof')   // overhang
  v.box(x, y, zt + 4, 3, 3, 1, 'roof2')          // ridge course
  v.set(x + (rot ? 0 : 2), y, zt + 5, 'wall2')   // chimney, off-corner
}

/** deterministic hash -> [0,1) */
function rnd(a, b = 0, c = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2246822519)) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h, 1274126177) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** separable box blur of a Float32 field (same shape as render.mjs's) */
function blurField(a, w, h, r) {
  if (r <= 0) return a
  const k = 2 * r + 1
  const tmp = new Float32Array(a.length)
  for (let y = 0; y < h; y++) {
    const row = y * w
    let sum = 0
    for (let x = 0; x <= r && x < w; x++) sum += a[row + x]
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / k
      if (x + r + 1 < w) sum += a[row + x + r + 1]
      if (x - r >= 0) sum -= a[row + x - r]
    }
  }
  const out = new Float32Array(a.length)
  for (let x = 0; x < w; x++) {
    let sum = 0
    for (let y = 0; y <= r && y < h; y++) sum += tmp[y * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / k
      if (y + r + 1 < h) sum += tmp[(y + r + 1) * w + x]
      if (y - r >= 0) sum -= tmp[(y - r) * w + x]
    }
  }
  return out
}

// iso stamp metrics, derived from CAMS (never inlined)
const HW = CAMS.iso.xStep[0]                        // half-width of a top lozenge
const TOPH = CAMS.iso.xStep[1] + CAMS.iso.yStep[1]  // lozenge height
const SIDEH = -CAMS.iso.zStep[1]                    // side-face height

/** EXACT replica of renderVox's canvas bounds (iso + optional blob shadow), so
 *  overlays land on the right pixel. */
function isoFrame(vox, shadow = true) {
  const cam = CAMS.iso
  const px = (x, y) => cam.xStep[0] * x + cam.yStep[0] * y
  const py = (x, y, z) => cam.xStep[1] * x + cam.yStep[1] * y + cam.zStep[1] * z
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const cols = new Set()
  for (let z = 0; z < vox.nz; z++) {
    for (let y = 0; y < vox.ny; y++) {
      for (let x = 0; x < vox.nx; x++) {
        if (vox.get(x, y, z) === null) continue
        const sx = px(x, y)
        const sy = py(x, y, z)
        if (sx - HW < minX) minX = sx - HW
        if (sx + HW - 1 > maxX) maxX = sx + HW - 1
        if (sy - TOPH < minY) minY = sy - TOPH
        if (sy + SIDEH - 1 > maxY) maxY = sy + SIDEH - 1
        cols.add(x * vox.ny + y)
      }
    }
  }
  if (shadow) {
    const blobR = SHADE.blobBlur // > 8 grounded columns here, so no small-prop bump
    for (const key of cols) {
      const x = Math.floor(key / vox.ny)
      const y = key % vox.ny
      const gx = px(x, y) + 1
      const gy = py(x, y, -1) + 1
      if (gx - HW - blobR < minX) minX = gx - HW - blobR
      if (gx + HW - 1 + blobR > maxX) maxX = gx + HW - 1 + blobR
      if (gy - TOPH - blobR < minY) minY = gy - TOPH - blobR
      if (gy - 1 + blobR > maxY) maxY = gy - 1 + blobR
    }
  }
  const ox = -minX
  const oy = -minY
  return {
    W: maxX - minX + 1,
    H: maxY - minY + 1,
    sx: (x, y) => px(x, y) + ox,
    sy: (x, y, z) => py(x, y, z) + oy,
  }
}

// ===========================================================================
// WORLD GEOMETRY — rotated space.  u = x - y (screen-x = 2u), v = x + y
// (screen-y = v - 2z).  A rect in (u, v) is a rect on screen.
// ===========================================================================
const U0 = -126, U1 = 126   // west / east edge
const V0 = 0, V1 = 482      // north / south edge
const OFF = 80              // grid origin shift; v_world = x + y - 2*OFF
const GW = 400, GH = 400, GZ = 40
const ZTOP = 4              // land surface z
const ZWATER = 1            // water surface z — 3 courses of cliff into it

const uOf = (x, y) => x - y
const vOf = (x, y) => x + y - 2 * OFF
const cellX = (u, v) => Math.round((u + v) / 2) + OFF
const cellY = (u, v) => Math.round((v - u) / 2) + OFF

// northern channel banks (north bank = smaller v), wobbling
const chanN = (u) => 76 + 5.5 * Math.sin(u / 17 + 1) + 3 * Math.sin(u / 6.3)
const chanS = (u) => 104 + 5.0 * Math.sin(u / 19) + 3 * Math.sin(u / 7.7)

/** smooth multi-octave field in [0,1] — burn cost + cloud macro-modulation */
function fbm(x, y, seed = 0) {
  const n =
    0.50 * Math.sin(x / 13.7 + y / 11.3 + seed) +
    0.30 * Math.sin(x / 6.1 - y / 8.9 + 2.1 + seed * 1.7) +
    0.20 * Math.sin(x / 27.3 + y / 21.7 + 4.3 + seed * 2.9)
  return 0.5 + 0.5 * n
}

// mainland band borders (v) — heavily wobbled so the ranges never read as five
// horizontal rules. Bands are 64 v apart, so +/-16 of snake never crosses.
const VLAND0 = 98
const borderV = (i, u) => {
  const k = SPAN / 64
  return BORDERS[i] + 11 * k * Math.sin(u / 29 + i * 1.7) + 5 * k * Math.sin(u / 11 + i * 3.1)
}

function bandAt(u, v) {
  if (v < chanN(u)) return JOURNEY[JOURNEY.length - 1]
  if (v <= chanS(u)) return null // water
  for (let i = 0; i < BORDERS.length; i++) if (v >= borderV(i, u)) return MAINLAND[i]
  return MAINLAND[MAINLAND.length - 1]
}

// slab silhouette (wobbled, then per-cell nibbled)
const uMinAt = (v) => U0 + 7 * Math.sin(v / 29) + 4 * Math.sin(v / 11.3)
const uMaxAt = (v) => U1 + 7 * Math.sin(v / 31 + 2) + 4 * Math.sin(v / 12.7)
const vMinAt = (u) => V0 + 6 * Math.sin(u / 27) + 3.5 * Math.sin(u / 10.1)
const vMaxAt = (u) => V1 - 6 * Math.sin(u / 25 + 1) - 3.5 * Math.sin(u / 9.7)

function layout(ids) {
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
/** grid seat of a w x d model whose centre should land on (u, v) */
function seatOf(u, v, w, d) {
  const cu = (w - d) / 2
  const cv = (w + d) / 2
  const sx = Math.round((u - cu + v - cv) / 2) + OFF
  const sy = Math.round((v - cv - u + cu) / 2) + OFF
  return [sx, sy]
}

/** the marker stands on the keep apron, in FRONT of the gate. The draft bakes
 *  Foundation's at (+8, +21) of a 30x20 seat; this scales it to any seat. */
const markerSeat = (sx, sy, w, d) => [sx + Math.round((w * 8) / 30), sy + d + 1, ZTOP + 1]

// interior lakes (pure geography) — [u, v, ru, rv]
const LAKES = [
  [-22, 452, 23, 15],   // foundation, deep in the earned tongue
  [4, 246, 17, 11],     // growth-reach
]
// interior mountain clusters (not borders) — [u, v, ru, rv, hMax]
const MASSIFS = [
  [-96, 356, 26, 17, 6],
  [92, 262, 22, 15, 5],
  [-20, 128, 20, 13, 5],
]

// ===========================================================================
// BUILD
// ===========================================================================
function buildWorld(realmOf) {
  const N = GW * GH
  const KIND = new Uint8Array(N)     // 0 void, 1 land, 2 water
  const BAND = new Uint8Array(N)     // realm index + 1
  const WARM = new Uint8Array(N)
  const MHEIGHT = new Uint8Array(N)  // mountain height above ZTOP
  const TOP = new Array(N).fill(null)
  const ROAD = new Uint8Array(N)
  const idx = (x, y) => y * GW + x
  const bandIx = (id) => JOURNEY.indexOf(id) + 1

  // ---- slab mask ---------------------------------------------------------
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const u = uOf(x, y)
      const v = vOf(x, y)
      if (u < uMinAt(v) || u > uMaxAt(v) || v < vMinAt(u) || v > vMaxAt(u)) continue
      // ragged coast: nibble cells sitting within 2 of any edge
      const edge = Math.min(u - uMinAt(v), uMaxAt(v) - u, v - vMinAt(u), vMaxAt(u) - v)
      if (edge < 2.5 && rnd(x, y, 11) < 0.42 - edge * 0.12) continue
      const id = bandAt(u, v)
      const i = idx(x, y)
      if (id === null) { KIND[i] = 2; continue }
      KIND[i] = 1
      BAND[i] = bandIx(id)
    }
  }
  // ---- lakes: carve out of the land -------------------------------------
  for (const [cu, cv, ru, rv] of LAKES) {
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        const i = idx(x, y)
        if (KIND[i] !== 1) continue
        const u = uOf(x, y), v = vOf(x, y)
        const q = ((u - cu) / ru) ** 2 + ((v - cv) / rv) ** 2
        const wob = 1 + 0.18 * Math.sin(Math.atan2(v - cv, u - cu) * 3 + cu)
        if (q < wob) { KIND[i] = 2; BAND[i] = 0 }
      }
    }
  }

  // ---- the road, stamped INTO the ground before the burn -----------------
  const doorUV = (id) => [SEAT_UV[id][0] + 2, SEAT_UV[id][1] + 27]
  const waypoints = [[SEAT_UV[MAINLAND[0]][0] + 42, V1 - 6], doorUV(MAINLAND[0])]
  const PASS = {}
  for (let i = 1; i < MAINLAND.length; i++) {
    const prev = MAINLAND[i - 1], here = MAINLAND[i]
    const pu = Math.round((SEAT_UV[prev][0] + SEAT_UV[here][0]) / 2 + (i % 2 ? 14 : -14))
    const pv = Math.round(borderV(i - 1, pu))
    PASS[here] = [pu, pv]
    waypoints.push([pu, pv], doorUV(here))
  }
  const disc = []
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
    if (dx * dx + dy * dy <= 8) disc.push([dx, dy])
  }
  const stampRoad = (x, y) => {
    for (const [dx, dy] of disc) {
      const i = idx(x + dx, y + dy)
      if (x + dx < 0 || x + dx >= GW || y + dy < 0 || y + dy >= GH) continue
      if (KIND[i] !== 1) continue
      TOP[i] = 'path'
      ROAD[i] = 1
    }
  }
  const walk = (a, b) => {
    let x = cellX(a[0], a[1]), y = cellY(a[0], a[1])
    const bx = cellX(b[0], b[1]), by = cellY(b[0], b[1])
    stampRoad(x, y)
    let guard = 0
    while ((x !== bx || y !== by) && guard++ < 4000) {
      if (x !== bx && (y === by || (x + y) % 2 === 0)) x += Math.sign(bx - x)
      else if (y !== by) y += Math.sign(by - y)
      stampRoad(x, y)
    }
  }
  for (let i = 0; i < waypoints.length - 1; i++) walk(waypoints[i], waypoints[i + 1])

  // ---- biome ground: base + organic dapple blobs -------------------------
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const i = idx(x, y)
      if (KIND[i] !== 1 || TOP[i]) continue
      TOP[i] = KIT[BAND[i] - 1][0]
    }
  }
  // dapple: irregular 2-5 cell blobs, never a grid
  for (let y = 1; y < GH - 1; y++) {
    for (let x = 1; x < GW - 1; x++) {
      const i = idx(x, y)
      if (KIND[i] !== 1 || ROAD[i]) continue
      if (rnd(x, y, 3) > 0.016) continue
      const kit = KIT[BAND[i] - 1]
      const n = 2 + Math.floor(rnd(x, y, 4) * 4)
      let cx = x, cy = y
      for (let s = 0; s < n; s++) {
        const j = idx(cx, cy)
        if (cx > 0 && cx < GW && cy > 0 && cy < GH && KIND[j] === 1 && !ROAD[j]) TOP[j] = kit[1]
        const d = Math.floor(rnd(cx, cy, s + 20) * 4)
        cx += [1, 0, -1, 0][d]
        cy += [0, 1, 0, -1][d]
      }
    }
  }

  // ---- relief FIRST (the burn reads it as resistance) --------------------
  const nearRoad = (x, y) => {
    for (let dx = -6; dx <= 6; dx++) {
      for (let dy = -6; dy <= 6; dy++) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue
        if (ROAD[idx(nx, ny)]) return true
      }
    }
    return false
  }
  const keepBoxes = []
  for (const id of JOURNEY) {
    const [w, d] = seatWD(id)
    const [sx, sy] = seatOf(SEAT_UV[id][0], SEAT_UV[id][1], w, d)
    keepBoxes.push([sx - 3, sy - 3, w + 6, d + 6])
  }
  const inKeep = (x, y) => keepBoxes.some(([bx, by, bw, bh]) => x >= bx && x < bx + bw && y >= by && y < by + bh)

  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const i = idx(x, y)
      if (KIND[i] !== 1) continue
      const bx = x & ~1, by = y & ~1        // 2x2 footprint quantization
      const u = uOf(bx, by), v = vOf(bx, by)
      let h = 0
      for (let b = 0; b < BORDERS.length; b++) {
        // R goes NEGATIVE on some stretches — natural gaps in the range, so a
        // border is a snaking chain of massifs, not a wall of gravel.
        const R = 5.5 + 5.0 * Math.sin(u / 17 + b) + 3.0 * Math.sin(u / 7.1 + b * 2)
        if (R <= 0.5) continue
        const d = Math.abs(v - borderV(b, u))
        if (d >= R) continue
        const peak = 3.6 + 4.0 * rnd(bx, by, 31 + b)
        h = Math.max(h, Math.round((1 - d / R) * peak + 0.35))
      }
      for (const [cu, cv, ru, rv, hm] of MASSIFS) {
        const q = Math.sqrt(((u - cu) / ru) ** 2 + ((v - cv) / rv) ** 2)
        if (q >= 1) continue
        h = Math.max(h, Math.round((1 - q) * (hm * (0.7 + 0.55 * rnd(bx, by, 47)))))
      }
      if (h <= 0) continue
      if (inKeep(x, y) || nearRoad(x, y)) continue   // carved pass
      MHEIGHT[i] = Math.min(h, 8)
    }
  }

  // ---- fog burn, per band, from the pass the road enters through ---------
  // A 4-neighbour BFS grows a Manhattan ball = an axis-aligned RECTANGLE in
  // screen space. So the frontier is a cheapest-cost flood instead: cost rides
  // a smooth noise field, the road is nearly free, the highlands resist.
  const burnCost = (i, x, y) => {
    if (ROAD[i]) return 0.10
    let c = 0.30 + 2.4 * fbm(x, y, 1.3) + 0.55 * rnd(x, y, 61)
    if (MHEIGHT[i]) c *= 2.6
    return c
  }
  for (const id of JOURNEY) {
    const bi = bandIx(id)
    const cells = []
    for (let i = 0; i < N; i++) if (BAND[i] === bi) cells.push(i)
    const keep = Math.round((realmOf(id).pct / 100) * cells.length)
    if (keep <= 0 || !cells.length) continue
    const origin = id === MAINLAND[0] ? doorUV(MAINLAND[0]) : PASS[id]
    const ox = cellX(origin[0], origin[1]), oy = cellY(origin[0], origin[1])
    let start = cells[0], best = Infinity
    for (const i of cells) {
      const d = (i % GW - ox) ** 2 + (Math.floor(i / GW) - oy) ** 2
      if (d < best) { best = d; start = i }
    }
    // binary min-heap over (cost, cell)
    const hc = [0], hi = [0]
    const push = (c, i) => {
      hc.push(c); hi.push(i)
      let k = hc.length - 1
      while (k > 1 && hc[k >> 1] > hc[k]) {
        const p = k >> 1
        const tc = hc[k]; hc[k] = hc[p]; hc[p] = tc
        const ti = hi[k]; hi[k] = hi[p]; hi[p] = ti
        k = p
      }
    }
    const pop = () => {
      const c = hc[1], i = hi[1]
      const lc = hc.pop(), li = hi.pop()
      if (hc.length > 1) {
        hc[1] = lc; hi[1] = li
        let k = 1
        for (;;) {
          let m = k
          const l = k * 2, r = l + 1
          if (l < hc.length && hc[l] < hc[m]) m = l
          if (r < hc.length && hc[r] < hc[m]) m = r
          if (m === k) break
          const tc = hc[k]; hc[k] = hc[m]; hc[m] = tc
          const ti = hi[k]; hi[k] = hi[m]; hi[m] = ti
          k = m
        }
      }
      return [c, i]
    }
    const seen = new Uint8Array(N)
    seen[start] = 1
    push(0, start)
    let n = 0
    while (hc.length > 1 && n < keep) {
      const [c, i] = pop()
      WARM[i] = 1
      n++
      const x = i % GW, y = (i / GW) | 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue
        const j = idx(nx, ny)
        if (seen[j] || BAND[j] !== bi) continue
        seen[j] = 1
        push(c + burnCost(j, nx, ny), j)
      }
    }
  }

  // ---- the voxel slab ----------------------------------------------------
  const vox = new Vox(GW, GH, GZ)
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const i = idx(x, y)
      if (KIND[i] === 1) {
        let top = TOP[i]
        if (!WARM[i] && top in WARM2FOG) top = WARM2FOG[top]
        vox.set(x, y, ZTOP, top)
        const body = WARM[i] ? ['dirt', 'dirt', 'dirt2', 'dirt2'] : ['fogdirt', 'fogdirt', 'fogdirt', 'fogdirt']
        for (let z = 0; z < ZTOP; z++) vox.set(x, y, z, body[ZTOP - 1 - z])
      } else if (KIND[i] === 2) {
        // earned water only where the shore it touches has been walked
        let warmShore = 0
        for (let dx = -5; dx <= 5 && !warmShore; dx++) {
          for (let dy = -5; dy <= 5; dy++) {
            const nx = x + dx, ny = y + dy
            if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue
            if (WARM[idx(nx, ny)]) { warmShore = 1; break }
          }
        }
        // sparse shimmer, uneven spacing (never metronomic)
        const shim = rnd(x, y, 5) < 0.085 || (rnd(x >> 1, y, 6) < 0.05)
        const m = warmShore
          ? (shim ? 'waterlt' : 'water')
          : (shim ? 'fogwaterlt' : 'fogwater')
        vox.set(x, y, ZWATER, m)
        vox.set(x, y, 0, warmShore ? 'water' : 'fogwater')
      }
    }
  }

  // ---- mountain masses ---------------------------------------------------
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const i = idx(x, y)
      const h = MHEIGHT[i]
      if (!h) continue
      const fog = !WARM[i]
      for (let dz = 1; dz <= h; dz++) {
        const cap = dz === h && h >= 6
        const m = fog
          ? (cap ? 'foglight' : dz >= h - 1 ? 'foglight' : 'fogmid')
          : (cap ? 'wall' : dz >= h - 1 ? 'stone' : 'dirt')
        vox.set(x, y, ZTOP + dz, m)
      }
    }
  }

  return { vox, KIND, BAND, WARM, MHEIGHT, ROAD, idx, bandIx, inKeep, nearRoad }
}

// ---------------------------------------------------------------- vegetation
function tree(vox, x, y, zt, kit, kind, seed) {
  const [, , can, can2] = kit
  if (kind === 0) {          // round orchard tree
    vox.set(x, y, zt + 1, 'flagpole')
    vox.box(x - 1, y - 1, zt + 2, 2, 2, 1, can2)
    vox.box(x - 1, y - 1, zt + 3, 2, 2, 1, can)
    vox.set(x - 1 + (seed & 1), y - 1, zt + 4, can)
    return
  }
  if (kind === 1) {          // tall conifer
    vox.set(x, y, zt + 1, 'flagpole')
    vox.box(x - 1, y - 1, zt + 2, 2, 2, 1, can2)
    vox.set(x, y, zt + 3, can2)
    vox.set(x - 1, y, zt + 3, can)
    vox.set(x, y - 1, zt + 3, can)
    vox.set(x, y, zt + 4, can)
    vox.set(x, y, zt + 5, can)
    return
  }
  if (kind === 2) {          // low bush clump, no visible trunk
    vox.set(x, y, zt + 1, can2)
    vox.set(x - 1, y, zt + 1, can2)
    vox.set(x, y - 1, zt + 1, can)
    vox.set(x, y, zt + 2, can)
    return
  }
  // sapling
  vox.set(x, y, zt + 1, 'flagpole')
  vox.set(x, y, zt + 2, can)
  vox.set(x - 1, y, zt + 2, can2)
}

function deadTrunk(vox, x, y, zt, seed) {
  const h = 2 + (seed % 2)
  for (let z = 1; z <= h; z++) vox.set(x, y, zt + z, 'flagpole')
  vox.set(x + (seed & 1 ? 1 : -1), y, zt + h, 'fogmid')
}

function boulder(vox, x, y, zt, seed) {
  vox.box(x, y, zt + 1, 2, 2, 1, 'fogmid')
  vox.set(x + (seed & 1), y, zt + 2, 'foglight')
}

function outcrop(vox, x, y, zt, seed) {
  vox.box(x, y, zt + 1, 2, 1, 1, 'stone')
  vox.set(x, y, zt + 2, seed & 1 ? 'stone' : 'dirt')
}

// ======================================================== chrome + overlays
/** realm chip; -> the rect it painted, so bands/hits can absorb it */
function label(pix, cx, bottomY, realm, canvasH) {
  const main = `${realm.label} ${realm.pct}%`
  const suffix = realm.caveats > 0 ? ` !${realm.caveats}` : ''
  const wMain = main.length * FONT.advance
  const wAll = wMain + suffix.length * FONT.advance
  const lx = Math.max(4, Math.min(Math.round(cx - wAll / 2), pix.w - wAll - 4))
  const ly = Math.max(3, Math.min(bottomY, canvasH - FONT.height - 3))
  const chip = new Pix(wAll + 4, FONT.height + 4)
  chip.fill(0, 0, chip.w, chip.h, '#101024A8')
  pix.compose(chip, lx - 3, ly - 2)
  drawText(pix, lx, ly, main)
  if (suffix) drawText(pix, lx + wMain, ly, suffix, MATS.caveat)
  return { x: lx - 3, y: ly - 2, w: chip.w, h: chip.h }
}

/** dashes along a bowed quadratic, cooling toward a fogged target */
function routeDashes(pix, p0, p1, bow) {
  const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1]
  const len = Math.hypot(dx, dy) || 1
  const ctrl = [mx - (dy / len) * bow, my + (dx / len) * bow]
  const q = (t) => [
    (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * ctrl[0] + t * t * p1[0],
    (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * ctrl[1] + t * t * p1[1],
  ]
  const steps = Math.ceil(len / 4)
  let acc = 0, next = 5, i = 0, prev = q(0)
  for (let s = 1; s <= steps; s++) {
    const pt = q(s / steps)
    acc += Math.hypot(pt[0] - prev[0], pt[1] - prev[1])
    prev = pt
    if (acc < next) continue
    next += 8 + ((i * 7) % 5)
    const t = s / steps
    const col = mix(MATS.path, MATS.foglight, 0.35 + t * 0.5)
    const x = Math.round(pt[0]), y = Math.round(pt[1])
    pix.fill(x - 2, y + 1, 4, 1, mix(MATS.fogdeep, MATS.fogmid, 0.4))
    pix.fill(x - 2, y - 1, 4, 2, col)
    i++
  }
}

// ============================================================ sprite plumbing
/** render a standalone Vox and report where its pixel (0,0) sits in world
 *  screen space. Shadow off: renderVox's bounds are then exactly isoFrame's,
 *  which makes the mapping a pure integer translation (asserted). */
function spriteOf(sv, ox, oy, oz, frame) {
  const pix = renderVox(sv, { camera: 'iso', shadow: false })
  const sf = isoFrame(sv, false)
  if (pix.w !== sf.W || pix.h !== sf.H) {
    throw new Error(`overworld: sprite bounds drifted — predicted ${sf.W}x${sf.H}, rendered ${pix.w}x${pix.h}`)
  }
  return {
    pix,
    x: (frame ? frame.sx(ox, oy) : 0) - sf.sx(0, 0),
    y: (frame ? frame.sy(ox, oy, oz) : 0) - sf.sy(0, 0, 0),
  }
}

/** [[wx, wy, wz, mat], ...] -> a placed sprite in world screen space */
function spriteOfCells(cells, frame) {
  if (!cells.length) throw new Error('overworld: sprite needs at least one cell')
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity
  for (const [x, y, z] of cells) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (z < z0) z0 = z
    if (x > x1) x1 = x
    if (y > y1) y1 = y
    if (z > z1) z1 = z
  }
  const sv = new Vox(x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1)
  for (const [x, y, z, m] of cells) sv.set(x - x0, y - y0, z - z0, m)
  return spriteOf(sv, x0, y0, z0, frame)
}

function cropOf(src, x, y, w, h) {
  const out = new Pix(w, h)
  for (let r = 0; r < h; r++) {
    const s = ((y + r) * src.w + x) * 4
    out.data.set(src.data.subarray(s, s + w * 4), r * out.w * 4)
  }
  return out
}

/** the world voxels that paint AFTER this one and overlap its stamp. render.mjs
 *  sorts by (x+y+z), ties by screen-y; two iso stamps overlap iff |dx-dy| <= 1
 *  and |dx+dy-2dz| <= 3. Cheap: ~3*nz*4 probes, all in the cell's own pencil. */
function occludersOf(vox, x, y, z) {
  const out = []
  for (let d = -1; d <= 1; d++) {
    for (let dz = -z; dz + z < vox.nz; dz++) {
      for (let s = 2 * dz - 3; s <= 2 * dz + 3; s++) {
        if ((s + d) & 1) continue                                  // dx must land on the grid
        if (s + dz < 0 || (s + dz === 0 && s - 2 * dz <= 0)) continue   // paints earlier (or is self)
        const nx = x + (s + d) / 2, ny = y + (s - d) / 2, nz = z + dz
        if (vox.get(nx, ny, nz) !== null) out.push([nx, ny, nz])
      }
    }
  }
  return out
}

/** a channel: the f0 raster under the moving art, plus each frame's art on top —
 *  minus whatever the world or the persistent chrome paints over that art. A
 *  brazier the map hides gets no channel: crimson may not land on fog terrain,
 *  and nothing may flicker over a label chip. -> channel | null */
function channelOf(kind, base, frame, vox, chrome, cellsPerFrame) {
  const sprites = cellsPerFrame.map((cells) => spriteOfCells(cells, frame))
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const s of sprites) {
    if (s.x < x0) x0 = s.x
    if (s.y < y0) y0 = s.y
    if (s.x + s.pix.w > x1) x1 = s.x + s.pix.w
    if (s.y + s.pix.h > y1) y1 = s.y + s.pix.h
  }
  const rect = { x: Math.max(0, x0), y: Math.max(0, y0) }
  rect.w = Math.min(base.w, x1) - rect.x
  rect.h = Math.min(base.h, y1) - rect.y
  if (rect.w <= 0 || rect.h <= 0) return null

  const hide = [...chrome]
  for (const cells of cellsPerFrame) {
    for (const [x, y, z] of cells) {
      for (const [ox, oy, oz] of occludersOf(vox, x, y, z)) {
        hide.push({ x: frame.sx(ox, oy) - HW, y: frame.sy(ox, oy, oz) - TOPH, w: HW * 2, h: TOPH + SIDEH })
      }
    }
  }
  const frames = sprites.map((s) => {
    const f = cropOf(base, rect.x, rect.y, rect.w, rect.h).blit(s.pix, s.x - rect.x, s.y - rect.y)
    for (const b of hide) {
      const bx = Math.max(rect.x, b.x), by = Math.max(rect.y, b.y)
      const bx1 = Math.min(rect.x + rect.w, b.x + b.w), by1 = Math.min(rect.y + rect.h, b.y + b.h)
      if (bx1 <= bx || by1 <= by) continue
      for (let y = by; y < by1; y++) {
        const src = (y * base.w + bx) * 4
        f.data.set(base.data.subarray(src, src + (bx1 - bx) * 4), ((y - rect.y) * f.w + bx - rect.x) * 4)
      }
    }
    return f
  })
  const moves = frames.some((f) => f.data.some((v, i) => v !== frames[0].data[i]))
  return moves ? { kind, rect, frames } : null
}

/** inclusive screen bounds -> a rect clipped to the canvas (always >= 1x1) */
function clampRect(x0, y0, x1, y1, pix) {
  const x = Math.max(0, Math.min(pix.w - 1, Math.round(x0)))
  const y = Math.max(0, Math.min(pix.h - 1, Math.round(y0)))
  return {
    x,
    y,
    w: Math.max(1, Math.min(pix.w - 1, Math.round(x1)) - x + 1),
    h: Math.max(1, Math.min(pix.h - 1, Math.round(y1)) - y + 1),
  }
}

// ===========================================================================
// COMPOSE
// ===========================================================================
/**
 * @param {{id, label, pct, caveats, beacons}[]} realms  journey order (see JOURNEY)
 * @param {{draftParity?: boolean}} opts
 */
export function composeOverworld(realms, opts = {}) {
  const parity = opts.draftParity === true
  if (!Array.isArray(realms) || realms.length < 3) {
    throw new Error('composeOverworld: need at least 3 realms')
  }
  layout(realms.map((r) => r.id))
  const realmOf = (id) => realms[JOURNEY.indexOf(id)]

  const world = buildWorld(realmOf)
  const { vox, KIND, BAND, WARM, MHEIGHT, ROAD, idx, bandIx, inKeep, nearRoad } = world

  // ---- life on earned land: groves, crop plots, huts, outcrops -----------
  const warmList = []
  const fogList = []
  for (let i = 0; i < GW * GH; i++) {
    if (KIND[i] !== 1 || ROAD[i] || MHEIGHT[i]) continue
    const x = i % GW, y = (i / GW) | 0
    if (inKeep(x, y)) continue
    ;(WARM[i] ? warmList : fogList).push(i)
  }
  const taken = new Uint8Array(GW * GH)
  const claim = (x, y, r) => {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue
        if (taken[idx(nx, ny)]) return false
      }
    }
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      const nx = x + dx, ny = y + dy
      if (nx >= 0 && ny >= 0 && nx < GW && ny < GH) taken[idx(nx, ny)] = 1
    }
    return true
  }
  const plantable = (x, y) => {
    const i = idx(x, y)
    return KIND[i] === 1 && !ROAD[i] && !MHEIGHT[i] && !inKeep(x, y)
  }

  for (const id of MAINLAND) {
    const kit = KIT[JOURNEY.indexOf(id)]
    const [treeBias, fieldBias, hasFlowers] = DEN[JOURNEY.indexOf(id)]
    const bi = bandIx(id)
    const mine = warmList.filter((i) => BAND[i] === bi)
    if (!mine.length) continue

    // --- crop plots + huts FIRST: they need contiguous free ground, and if
    //     trees run first they claim every candidate rectangle out from under them
    const plots = Math.round(mine.length / 330 * fieldBias)
    for (let p = 0, tries = 0; p < plots && tries < plots * 14; tries++) {
      const c = mine[Math.floor(rnd(tries, bi, 98) * mine.length)]
      const px0 = c % GW, py0 = (c / GW) | 0
      const pw = 6 + Math.floor(rnd(tries, bi, 99) * 6)
      const ph = 5 + Math.floor(rnd(tries, bi, 100) * 5)
      let ok = px0 + pw < GW - 1 && py0 + ph < GH - 1
      for (let dx = -1; dx <= pw && ok; dx++) for (let dy = -1; dy <= ph; dy++) {
        const x = px0 + dx, y = py0 + dy
        if (!plantable(x, y) || !WARM[idx(x, y)] || taken[idx(x, y)]) { ok = false; break }
      }
      if (!ok) continue
      const vert = rnd(tries, bi, 108) < 0.6
      for (let dx = 0; dx < pw; dx++) for (let dy = 0; dy < ph; dy++) {
        const x = px0 + dx, y = py0 + dy
        taken[idx(x, y)] = 1
        // constant-u rows read vertical on screen, constant-v rows horizontal
        const stripe = (((vert ? x - y : x + y) >> 1) & 1)
        vox.set(x, y, ZTOP, stripe ? kit[4] : kit[1])
      }
      p++
    }

    // --- huts, small hamlets rather than lone cabins
    const wantHuts = 3 + (bi % 3)
    for (let h = 0, placed = 0; h < 500 && placed < wantHuts; h++) {
      const c = mine[Math.floor(rnd(h, bi, 101) * mine.length)]
      const x = c % GW, y = (c / GW) | 0
      if (x < 4 || y < 4 || x >= GW - 7 || y >= GH - 7) continue
      let flat = true
      for (let dx = -1; dx < 4 && flat; dx++) for (let dy = -1; dy < 4; dy++) {
        if (!plantable(x + dx, y + dy) || !WARM[idx(x + dx, y + dy)]) { flat = false; break }
      }
      if (!flat || !claim(x + 1, y + 1, 4)) continue
      hut(vox, x, y, ZTOP, (x + y) & 1)
      placed++
    }

    // --- groves: seed centres, then organic polar scatter around each
    const groves = Math.max(3, Math.round(mine.length / 70 * treeBias))
    for (let g = 0; g < groves; g++) {
      const c = mine[Math.floor(rnd(g, bi, 91) * mine.length)]
      const cx = c % GW, cy = (c / GW) | 0
      const n = 5 + Math.floor(rnd(g, bi, 92) * 8)
      for (let t = 0; t < n; t++) {
        const a = rnd(g, bi * 7 + t, 93) * Math.PI * 2
        const r = 1.5 + rnd(g, bi * 7 + t, 94) * 7.5
        const x = Math.round(cx + Math.cos(a) * r)
        const y = Math.round(cy + Math.sin(a) * r * 0.9)
        if (x < 2 || y < 2 || x >= GW - 2 || y >= GH - 2) continue
        if (!plantable(x, y) || !WARM[idx(x, y)]) continue
        if (!claim(x, y, 1)) continue
        const roll = rnd(x, y, 95)
        const kind = kit[2] === 'pine'
          ? (roll < 0.7 ? 1 : roll < 0.9 ? 0 : 2)
          : (roll < 0.42 ? 0 : roll < 0.66 ? 1 : roll < 0.88 ? 2 : 3)
        tree(vox, x, y, ZTOP, kit, kind, (x * 3 + y) & 3)
      }
    }

    // --- lone trees so the groves are not the only rhythm
    for (let t = 0; t < Math.round(mine.length / 130 * treeBias); t++) {
      const c = mine[Math.floor(rnd(t, bi, 96) * mine.length)]
      const x = c % GW, y = (c / GW) | 0
      if (x < 2 || y < 2 || x >= GW - 2 || y >= GH - 2) continue
      if (!plantable(x, y) || !WARM[idx(x, y)] || !claim(x, y, 2)) continue
      tree(vox, x, y, ZTOP, kit, rnd(x, y, 97) < 0.5 ? 0 : 3, (x + y) & 3)
    }

    // --- meadow flower specks (spring / misty realms only), single top cells
    if (hasFlowers) {
      for (const i of mine) {
        const x = i % GW, y = (i / GW) | 0
        if (taken[i] || ROAD[i] || MHEIGHT[i]) continue
        const r = rnd(x, y, 104)
        if (r > 0.014) continue
        vox.set(x, y, ZTOP, r < 0.008 ? 'flowerwhite' : 'floweryellow')
      }
    }

    // --- stone outcrops
    for (let s = 0; s < Math.round(mine.length / 320); s++) {
      const c = mine[Math.floor(rnd(s, bi, 102) * mine.length)]
      const x = c % GW, y = (c / GW) | 0
      if (x < 2 || y < 2 || x >= GW - 2 || y >= GH - 2) continue
      if (!plantable(x, y) || !WARM[idx(x, y)] || !claim(x, y, 3)) continue
      outcrop(vox, x, y, ZTOP, x + y)
    }
  }

  // ---- fog land: dead trunks + boulders only, nothing that implies progress
  for (const i of fogList) {
    const x = i % GW, y = (i / GW) | 0
    const r = rnd(x, y, 103)
    if (r < 0.0055) {
      if (!claim(x, y, 4)) continue
      deadTrunk(vox, x, y, ZTOP, x + y)
    } else if (r < 0.0105) {
      if (x >= GW - 2 || y >= GH - 2 || !claim(x, y, 4)) continue
      boulder(vox, x, y, ZTOP, x * 3 + y)
    }
  }

  // ---- keeps -------------------------------------------------------------
  // The draft's seating, unchanged: castle-32 for the realm you stand in
  // (flagless — the flag raises at 100%), castle-sealed for the realms ahead
  // (x-flipped for variety), sealed castle-24 across the channel. Extended
  // honestly: pct===100 seats that realm's OWN castle class, alive, flag up.
  const sealed32 = castle.MODELS['castle-sealed'].build()
  const sealed32f = flipVox(sealed32)
  const seats = {}
  const keepTop = {}
  const flagVariants = []
  for (const id of JOURNEY) {
    const [w, d] = seatWD(id)
    const [sx, sy] = seatOf(SEAT_UV[id][0], SEAT_UV[id][1], w, d)
    seats[id] = [sx, sy, w, d]
    let keep
    if (realmOf(id).pct === 100) {
      const model = castle.MODELS[KEEPCLASS[id]]
      keep = model.build(0)
      // a 2-frame keep waves: diff the frames out of the bake, hand them to a channel
      const v = model.frames === 2 ? variantCells(keep, model.build(1)) : null
      if (FLIPS[id]) keep = flipVox(keep)
      if (v) {
        const place = FLIPS[id] ? ([x, y, z, m]) => [keep.nx - 1 - x, y, z, m] : (c) => c
        flagVariants.push({ id, sx, sy, c0: v.c0.map(place), c1: v.c1.map(place) })
      }
    } else if (id === JOURNEY[0]) {
      keep = remapVox(castle.MODELS['castle-32'].build(0), { flag: null })
    } else if (KEEPCLASS[id] === 'castle-24') {
      keep = remapVox(castle.MODELS['castle-24'].build(), SEAL24)
    } else {
      keep = FLIPS[id] ? sealed32f : sealed32
    }
    keepTop[id] = maxZOf(keep)
    mergeVox(vox, keep, sx, sy, ZTOP + 1)
    if (parity && id === JOURNEY[0]) {
      // the draft bakes the party marker on the apron, in FRONT of the keep
      const [mx, my, mz] = markerSeat(sx, sy, w, d)
      mergeVox(vox, marker.MODELS.marker.build(0), mx, my, mz)
    }
  }

  // ---- beacons: crimson braziers, in FOG only, min 20 cells apart ---------
  const beaconCells = []
  for (const id of MAINLAND) {
    const realm = realmOf(id)
    if (!realm.beacons) continue
    const bi = bandIx(id)
    // shuffle rather than sort by distance-from-keep (that parked every brazier
    // on the outer coast rim) and only require real separation
    const [ksx, ksy] = seats[id]
    const cand = fogList
      .filter((i) => BAND[i] === bi && !MHEIGHT[i])
      .map((i) => [i, rnd(i, bi, 131)])
      .sort((a, b) => a[1] - b[1])
      .map(([i]) => i)
    let placed = 0
    for (const i of cand) {
      if (placed >= realm.beacons) break
      const x = i % GW, y = (i / GW) | 0
      if (nearRoad(x, y)) continue
      const dk = (x - ksx - 15) ** 2 + (y - ksy - 10) ** 2
      if (dk < 24 * 24) continue                              // clear of the keep
      if (beaconCells.some(([bx, by]) => (x - bx) ** 2 + (y - by) ** 2 < 26 * 26)) continue
      brazier(vox, x, y, ZTOP)
      beaconCells.push([x, y])
      placed++
    }
  }

  // ---- render ------------------------------------------------------------
  const frame = isoFrame(vox, true)
  const out = renderVox(vox, { camera: 'iso' })
  const W = out.w, H = out.h
  if (W !== frame.W || H !== frame.H) {
    throw new Error(`overworld: frame mismatch — predicted ${frame.W}x${frame.H}, got ${W}x${H}`)
  }

  // band boxes in SCREEN space: terrain first, clouds folded in below
  const bandBox = {}
  for (const id of JOURNEY) bandBox[id] = [Infinity, Infinity, -Infinity, -Infinity]
  const grow = (id, x0, y0, x1, y1) => {
    const b = bandBox[id]
    if (x0 < b[0]) b[0] = x0
    if (y0 < b[1]) b[1] = y0
    if (x1 > b[2]) b[2] = x1
    if (y1 > b[3]) b[3] = y1
  }

  // ---- earned map in SCREEN space (clouds must never cover earned land) ---
  const earned = new Float32Array(W * H)
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const i = idx(x, y)
      if (BAND[i]) {
        const zt = ZTOP + MHEIGHT[i]
        grow(JOURNEY[BAND[i] - 1],
          frame.sx(x, y) - HW, frame.sy(x, y, zt) - TOPH,
          frame.sx(x, y) + HW - 1, frame.sy(x, y, 0) + SIDEH - 1)
      }
      if (!WARM[i]) continue
      const zt = ZTOP + MHEIGHT[i]
      const cx = frame.sx(x, y), cy = frame.sy(x, y, zt)
      for (let r = -2; r < 2; r++) {
        for (let c = -2; c < 2; c++) {
          const px = cx + c, py = cy + r
          if (px >= 0 && py >= 0 && px < W && py < H) earned[py * W + px] = 1
        }
      }
    }
  }
  const earnedSoft = blurField(earned, W, H, 7)

  // ---- clouds = the fog of war -------------------------------------------
  const cloud = new Float32Array(W * H)
  const lobe = (cx, cy, rx, ry, peak) => {
    const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(W - 1, Math.ceil(cx + rx))
    const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(H - 1, Math.ceil(cy + ry))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
        if (q >= 1) continue
        const a = peak * (1 - q * 0.55)
        const j = y * W + x
        if (a > cloud[j]) cloud[j] = a
      }
    }
  }
  for (const id of JOURNEY) {
    const realm = realmOf(id)
    const bi = bandIx(id)
    const fogCells = []
    for (let i = 0; i < GW * GH; i++) if (BAND[i] === bi && !WARM[i]) fogCells.push(i)
    if (!fogCells.length) continue
    // coverage + opacity both scale inversely with earned %: the fog TERRAIN is
    // already half the honesty signal, so the deck must leave gaps and read as
    // weather rather than as a grey wash.
    const t = Math.min(1, realm.pct / 71)
    const peak = 1.00 - 0.30 * t
    const density = 1.40 - 0.88 * t
    const seeds = Math.max(3, Math.round(fogCells.length / 190 * density))
    for (let s = 0; s < seeds; s++) {
      const i = fogCells[Math.floor(rnd(s, bi, 201) * fogCells.length)]
      const x = i % GW, y = (i / GW) | 0
      const cx = frame.sx(x, y)
      const cy = frame.sy(x, y, ZTOP) - 8      // clouds hover a little
      // macro weather field: whole stretches of fog stay open, so the deck has
      // real holes instead of an even blanket
      const macro = Math.max(0, Math.min(1, (fbm(cx / 4.4, cy / 3.1, 7.7) - 0.22) * 1.9))
      if (macro <= 0.04) continue
      const lobes = 3 + Math.floor(rnd(s, bi, 202) * 4)
      for (let l = 0; l < lobes; l++) {
        const ang = rnd(s, bi * 5 + l, 203) * Math.PI * 2
        const dist = rnd(s, bi * 5 + l, 204) * 20
        // a disc on the ground plane projects 2:1 in iso, so rx ~ 2*ry — but
        // keep the lobes SMALL and numerous or neighbouring seeds blur into
        // one long horizontal smear
        const lx = cx + Math.cos(ang) * dist * 1.3
        const ly = cy + Math.sin(ang) * dist * 0.9
        const rx = 9 + rnd(s, bi * 5 + l, 205) * 12
        const ry = 5 + rnd(s, bi * 5 + l, 206) * 6
        lobe(lx, ly, rx, ry, peak * macro * (0.70 + 0.30 * rnd(s, bi * 5 + l, 207)))
        // the band owns its weather: deck (blur 5) + its dropped shadow (10, blur 5)
        grow(id, Math.floor(lx - rx) - 10, Math.floor(ly - ry) - 10,
          Math.ceil(lx + rx) + 10, Math.ceil(ly + ry) + 20)
      }
    }
  }
  const cloudSoft = blurField(cloud, W, H, 5)

  // gate: fade off earned land, punch glints for beacons and sealed keeps
  const hole = new Float32Array(W * H)
  const punch = (cx, cy, r, depth) => {
    for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) {
        const q = ((x - cx) / r) ** 2 + ((y - cy) / r) ** 2
        if (q >= 1) continue
        const a = depth * (1 - q)
        const j = y * W + x
        if (a > hole[j]) hole[j] = a
      }
    }
  }
  for (const [x, y] of beaconCells) punch(frame.sx(x, y), frame.sy(x, y, ZTOP + 5), 15, 0.92)
  for (const id of JOURNEY) {
    if (id === JOURNEY[0]) continue
    const [sx, sy, w, d] = seats[id]
    // LatAm is 0% earned, so its band is otherwise a solid deck — it needs a
    // real GAP or the sealed keep vanishes entirely
    const deep = realmOf(id).pct === 0 ? 0.93 : 0.5
    const r = realmOf(id).pct === 0 ? 32 : 30
    punch(frame.sx(sx + (w >> 1), sy + (d >> 1)), frame.sy(sx + (w >> 1), sy + (d >> 1), ZTOP + 22), r, deep)
  }
  // A raised flag flies 10 voxels above the keep punch, which is deep in the
  // NEXT band's weather — measured, the deck erased the whole pennant. A
  // conquered crown is an earned monument, so it gets the brazier's hole.
  for (const id of JOURNEY) {
    if (realmOf(id).pct !== 100) continue
    const [sx, sy, w, d] = seats[id]
    const cx = sx + (w >> 1), cy = sy + (d >> 1)
    punch(frame.sx(cx, cy), frame.sy(cx, cy, ZTOP + 1 + keepTop[id]), 15, 0.92)
  }
  const holeSoft = blurField(hole, W, H, 5)

  const gated = new Float32Array(W * H)
  const cloudPix = new Pix(W, H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const j = y * W + x
      if (out.data[j * 4 + 3] === 0) continue          // never paint into the void
      let a = cloudSoft[j]
      // CONTRAST CURVE — a flat blurred field at mid alpha turns to grey-brown
      // haze over the purple fog terrain. Push the cores to near-opaque white
      // and let only the rim be translucent: that reads as a cloud DECK.
      a = Math.max(0, Math.min(1, (a - 0.14) / 0.30))
      a = a * a * (3 - 2 * a)                       // smoothstep
      // hard gate: a cloud within ~5px of walked ground still desaturates it.
      // 4.0 clears the deck fully around every burn edge.
      a *= Math.max(0, 1 - 4.0 * earnedSoft[j])
      a *= Math.max(0, 1 - holeSoft[j])
      if (a <= 0.012) continue
      a = Math.min(0.97, a)
      gated[j] = a
      // bright ivory core, cool plum-tinted skirt = volume, not a flat veil
      const col = a > 0.55
        ? mix('#F4F2FA', '#FFFEFA', Math.min(1, (a - 0.55) / 0.35))
        : mix('#CFCDE4', '#F4F2FA', Math.min(1, a / 0.55))
      cloudPix.set(x, y, `${col}${Math.round(a * 255).toString(16).padStart(2, '0')}`)
    }
  }

  // ---- assemble ----------------------------------------------------------
  // the unwalked crossing to LatAm, drawn on the channel BEFORE the clouds
  {
    const [csx, csy, cw, cd] = seats[JOURNEY[JOURNEY.length - 2]]
    const [lsx, lsy, lw, ld] = seats[JOURNEY[JOURNEY.length - 1]]
    const p0 = [frame.sx(csx + (cw >> 1), csy + cd), frame.sy(csx + (cw >> 1), csy + cd, ZTOP)]
    const p1 = [frame.sx(lsx + (lw >> 1), lsy + ld), frame.sy(lsx + (lw >> 1), lsy + ld, ZTOP)]
    routeDashes(out, p0, p1, 26)
  }
  // cloud shadow on the ground BEFORE the deck itself — the puffs then float
  // instead of looking painted onto the dirt. Offset south, re-gated on the
  // earned map so a shadow can never creep onto walked land.
  {
    const drop = 10
    const shifted = new Float32Array(W * H)
    for (let y = drop; y < H; y++) {
      for (let x = 0; x < W; x++) shifted[y * W + x] = gated[(y - drop) * W + x]
    }
    const shadow = blurField(shifted, W, H, 5)
    const shPix = new Pix(W, H)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const j = y * W + x
        if (out.data[j * 4 + 3] === 0) continue
        const a = shadow[j] * 0.34 * Math.max(0, 1 - 4.0 * earnedSoft[j])
        if (a <= 0.02) continue
        shPix.set(x, y, `${SHADE.shadow}${Math.round(Math.min(0.42, a) * 255).toString(16).padStart(2, '0')}`)
      }
    }
    out.compose(shPix, 0, 0)
  }
  out.compose(cloudPix, 0, 0)

  // ---- labels ------------------------------------------------------------
  const chips = {}
  for (const id of JOURNEY) {
    const [sx, sy, w, d] = seats[id]
    const lx = frame.sx(sx + (w >> 1), sy + (d >> 1))
    // LatAm's keep is short, so the default chip lands ON it — drop it onto the
    // channel bank instead and leave the sealed silhouette clear
    const ly = frame.sy(sx + w - 1, sy + d - 1, ZTOP) + (KEEPCLASS[id] === 'castle-24' ? 15 : 3)
    chips[id] = label(out, lx, ly, realmOf(id), H)
  }

  // ---- the moving art, cropped off the finished raster --------------------
  const markerPair = [0, 1].map((f) => spriteOf(marker.MODELS.marker.build(f), 0, 0, 0, null))
  const mx0 = Math.min(markerPair[0].x, markerPair[1].x)
  const my0 = Math.min(markerPair[0].y, markerPair[1].y)
  const mw = Math.max(markerPair[0].x + markerPair[0].pix.w, markerPair[1].x + markerPair[1].pix.w) - mx0
  const mh = Math.max(markerPair[0].y + markerPair[0].pix.h, markerPair[1].y + markerPair[1].pix.h) - my0
  const markerFrames = markerPair.map((s) => new Pix(mw, mh).blit(s.pix, s.x - mx0, s.y - my0))

  const chrome = JOURNEY.map((id) => chips[id])   // label chips stay on top of everything
  const channels = []
  for (const [x, y] of beaconCells) {
    // questtile.mjs `qt-beacon` grammar: the flame tip dances corner to corner
    // with one gold spark, one voxel above the baked crimson body
    const zt = ZTOP + 6
    const c = channelOf('beacon', out, frame, vox, chrome, [
      [[x, y, zt, 'markerhi'], [x + 1, y + 1, zt, 'windowlit']],
      [[x + 1, y + 1, zt, 'markerhi'], [x, y + 1, zt, 'windowlit']],
    ])
    if (c) channels.push(c)
  }
  for (const v of flagVariants) {
    const place = (cells) => cells.map(([x, y, z, m]) => [v.sx + x, v.sy + y, ZTOP + 1 + z, m])
    const c = channelOf('flag', out, frame, vox, chrome, [place(v.c0), place(v.c1)])
    if (c) channels.push(c)
  }

  // ---- sites + bands -----------------------------------------------------
  const sites = realms.map(({ id }) => {
    const [sx, sy, w, d] = seats[id]
    const [mx, my, mz] = markerSeat(sx, sy, w, d)
    const anchor = { x: frame.sx(mx, my) + mx0, y: frame.sy(mx, my, mz) + my0 }
    const c = chips[id]
    return {
      id,
      anchor,   // compose markerFrames[f] here — both frames share this registration
      hit: clampRect(
        Math.min(frame.sx(sx, sy + d - 1) - HW, anchor.x, c.x),
        Math.min(frame.sy(sx, sy, ZTOP + 1 + keepTop[id]) - TOPH, anchor.y, c.y),
        Math.max(frame.sx(sx + w - 1, sy) + HW - 1, anchor.x + mw - 1, c.x + c.w - 1),
        Math.max(frame.sy(sx + w - 1, sy + d - 1, ZTOP) + SIDEH - 1, anchor.y + mh - 1, c.y + c.h - 1),
        out),
    }
  })

  const bands = realms.map(({ id }) => {
    const b = bandBox[id]
    const c = chips[id]
    return { id, rect: clampRect(Math.min(b[0], c.x), Math.min(b[1], c.y),
      Math.max(b[2], c.x + c.w - 1), Math.max(b[3], c.y + c.h - 1), out) }
  })

  return { pix: out, sites, bands, channels, markerFrames }
}
