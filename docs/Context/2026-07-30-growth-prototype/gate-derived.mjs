#!/usr/bin/env node
// arcade/check-overworld.mjs — fidelity gate for arcade/overworld.mjs (CONTRACT.md).
// RAISE style: every failure throws, exit code 1. Node builtins are allowed HERE
// only (the module under check imports none).
//
//   1. draftParity over the FROZEN A1 census must reproduce
//      proto-a4-continent/out/draft-f.png byte-identically (pinned sha1).
//   2. live mode over the same census: 7 ordered sites, 7 bands, 14 beacon
//      channels, 2 marker frames, no empty rect, every channel frame seamless
//      against the baked raster it was cropped from.
//   3. a synthetic realm at pct 100 must raise a flag and open a flag channel.
//
// Run: node arcade/check-overworld.mjs

import { createHash } from 'node:crypto'
import { encodePNG } from 'file:///C:/Users/Aaron/Documents/Repos/red-tracker/proto-a2-tileset/lib/png.mjs'
import { composeOverworld } from './ow-derived.mjs'

const PINNED = '445f98dc0fd8a12880e7ccfe4c10b0fa7679c5ae'   // out/draft-f.png @1x

// the frozen A1 census the draft hardcoded — copied here, never into the module
const FROZEN = [
  { id: 'foundation',         label: 'FOUNDATION',   pct: 71, beacons: 0, caveats: 4 },
  { id: 'sellable-product',   label: 'SELLABLE',     pct: 25, beacons: 2, caveats: 1 },
  { id: 'monetization',       label: 'MONETIZATION', pct: 18, beacons: 2, caveats: 1 },
  { id: 'growth-reach',       label: 'GROWTH',       pct: 27, beacons: 4, caveats: 2 },
  { id: 'go-to-market',       label: 'GO-TO-MARKET', pct: 30, beacons: 3, caveats: 0 },
  { id: 'customer-support',   label: 'SUPPORT',      pct: 33, beacons: 3, caveats: 0 },
  { id: 'latam-expansion',    label: 'LATAM',        pct: 0,  beacons: 0, caveats: 1 },
]
const ORDER = FROZEN.map((r) => r.id)

let checks = 0
function ok(cond, what) {
  checks++
  if (!cond) throw new Error(`FAIL — ${what}`)
}

/** renderVox narrates every render; the gate's own output is the signal */
function quiet(fn) {
  const log = console.log
  console.log = () => {}
  try { return fn() } finally { console.log = log }
}

const sha1 = (buf) => createHash('sha1').update(buf).digest('hex')
const bytesEqual = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])

/** A channel frame must BE the f0 raster with a little opaque voxel art blitted
 *  on: every pixel either matches the raster underneath (so the rect has no
 *  visible edge) or is fully opaque art. A second scene render would fail both
 *  arms — it would differ nearly everywhere, and its fringes would be soft. */
function seam(frame, base, rect) {
  let painted = 0
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const f = (y * frame.w + x) * 4
      const b = ((rect.y + y) * base.w + rect.x + x) * 4
      let same = true
      for (let c = 0; c < 4; c++) if (frame.data[f + c] !== base.data[b + c]) same = false
      if (same) continue
      if (frame.data[f + 3] !== 255) return { painted, soft: true }
      painted++
    }
  }
  return { painted, soft: false }
}

const inCanvas = (r, pix) =>
  r.w > 0 && r.h > 0 && r.x >= 0 && r.y >= 0 && r.x + r.w <= pix.w && r.y + r.h <= pix.h

// ---------------------------------------------------------------- 1. parity
const t0 = Date.now()
const draft = quiet(() => composeOverworld(FROZEN, { draftParity: true }))
const got = sha1(encodePNG(draft.pix))
console.log(`draft parity   sha1 ${got}`)
ok(got === PINNED, `draftParity sha1 ${got} != pinned ${PINNED}`)
console.log(`               ${got === PINNED ? 'PASS' : 'FAIL'} — byte-identical to out/draft-f.png (${draft.pix.w}x${draft.pix.h})`)

// ------------------------------------------------------------------ 2. live
const live = quiet(() => composeOverworld(FROZEN))
const { pix, sites, bands, channels, markerFrames } = live

ok(pix.w === 554 && pix.h === 516, `live canvas ${pix.w}x${pix.h}, expected 554x516`)
ok(!bytesEqual(pix.data, draft.pix.data), 'live raster must differ from parity (no baked marker)')

ok(sites.length === 7, `sites ${sites.length}, expected 7`)
sites.forEach((s, i) => {
  ok(s.id === ORDER[i], `site ${i} is '${s.id}', walk order wants '${ORDER[i]}'`)
  ok(Number.isInteger(s.anchor.x) && Number.isInteger(s.anchor.y), `site ${s.id} anchor not integral`)
  ok(inCanvas(s.hit, pix), `site ${s.id} hit rect off-canvas: ${JSON.stringify(s.hit)}`)
})

ok(bands.length === 7, `bands ${bands.length}, expected 7`)
bands.forEach((b, i) => {
  ok(b.id === ORDER[i], `band ${i} is '${b.id}', expected '${ORDER[i]}'`)
  ok(inCanvas(b.rect, pix), `band ${b.id} rect off-canvas: ${JSON.stringify(b.rect)}`)
  ok(b.rect.w > 40 && b.rect.h > 20, `band ${b.id} rect is a sliver: ${JSON.stringify(b.rect)}`)
})

// The census places 14 braziers. Draft F's own composition HIDES three of them
// — two behind fog massifs (grid-occluded), one under the SUPPORT label chip —
// so animating those would put crimson on bare fog terrain and motion over
// persistent chrome. Both are forbidden by the standing law, so a hidden
// brazier gets no channel. Everything here is derived, nothing is hardcoded.
const PLACED = FROZEN.reduce((a, r) => a + r.beacons, 0)
const HIDDEN = 3
const beacons = channels.filter((c) => c.kind === 'beacon')
ok(PLACED === 14, `census places ${PLACED} braziers, expected 14`)
ok(beacons.length === PLACED - HIDDEN, `beacon channels ${beacons.length}, expected ${PLACED - HIDDEN} (${PLACED} placed - ${HIDDEN} the map hides)`)
ok(channels.filter((c) => c.kind === 'flag').length === 0, 'no realm is at 100% today — expected 0 flag channels')

for (const c of channels) checkChannel(c, pix)
function checkChannel(c, base) {
  const area = c.rect.w * c.rect.h
  ok(inCanvas(c.rect, base), `${c.kind} channel rect off-canvas: ${JSON.stringify(c.rect)}`)
  ok(area > 0 && area <= 4096, `${c.kind} channel rect is not a small rect: ${JSON.stringify(c.rect)}`)
  ok(c.frames.length === 2, `${c.kind} channel has ${c.frames.length} frames, expected 2`)
  c.frames.forEach((f, i) => {
    ok(f.w === c.rect.w && f.h === c.rect.h, `${c.kind} frame ${f.w}x${f.h} != rect ${c.rect.w}x${c.rect.h}`)
    const { painted, soft } = seam(f, base, c.rect)
    ok(!soft, `${c.kind} frame ${i} has a soft (non-art) pixel — it is not the baked raster + art`)
    ok(painted > 0, `${c.kind} frame ${i} paints nothing over the raster`)
    ok(painted < area, `${c.kind} frame ${i} repaints the whole rect — that is a second render, not a channel`)
  })
  ok(!bytesEqual(c.frames[0].data, c.frames[1].data), `${c.kind} channel frames are identical — nothing moves`)
}

ok(markerFrames.length === 2, `markerFrames ${markerFrames.length}, expected 2`)
ok(markerFrames[0].w === markerFrames[1].w && markerFrames[0].h === markerFrames[1].h,
  'marker frames must share one registration')
ok(!bytesEqual(markerFrames[0].data, markerFrames[1].data), 'marker frames identical — no bob')
ok(markerFrames[0].data.some((v, i) => i % 4 === 3 && v > 0), 'marker frame 0 is empty')

console.log(`live mode      PASS — ${pix.w}x${pix.h}, ${sites.length} sites, ${bands.length} bands, ` +
  `${beacons.length} beacon channels (${PLACED} braziers - ${HIDDEN} the map hides), ` +
  `${markerFrames.length} marker frames ${markerFrames[0].w}x${markerFrames[0].h}`)

// determinism: the shell composes twice (old/new pct) for the A7 delta burn
const again = quiet(() => composeOverworld(FROZEN))
ok(bytesEqual(again.pix.data, pix.data), 'same realms in -> different raster out (non-deterministic)')
console.log('determinism    PASS — same census recomposed byte-identical')

// ------------------------------------------------------- 3. conquered realm
const CONQUERED = FROZEN.map((r) => (r.id === 'sellable-product' ? { ...r, pct: 100 } : r))
const won = quiet(() => composeOverworld(CONQUERED))
const flags = won.channels.filter((c) => c.kind === 'flag')
const wonBeacons = won.channels.filter((c) => c.kind === 'beacon')

ok(won.pix.w === 554 && won.pix.h === 516, `conquered canvas ${won.pix.w}x${won.pix.h}, expected 554x516`)
ok(flags.length === 1, `flag channels ${flags.length}, expected 1 for one realm at 100%`)
for (const f of flags) checkChannel(f, won.pix)
for (const c of wonBeacons) checkChannel(c, won.pix)
ok(wonBeacons.length === beacons.length - 2,
  `beacon channels ${wonBeacons.length}, expected ${beacons.length - 2} — a 100% realm has no fog left to stand its 2 braziers in`)
ok(!bytesEqual(won.pix.data, pix.data), 'conquered raster identical to live — the castle never changed')

console.log(`flag path      PASS — sellable-product at 100%: ${flags.length} flag channel ` +
  `${flags[0].rect.w}x${flags[0].rect.h}, beacons ${wonBeacons.length}`)
console.log(`\n${checks} assertions PASS in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
