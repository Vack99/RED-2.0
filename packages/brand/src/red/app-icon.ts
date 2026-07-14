import { ICON, RING_BOT, RING_TOP } from "./mark-geometry";
import { redTokens } from "./tokens";

// RED's self-contained app icon (served by the dynamic /icon favicon route). Same
// contract as Forge's (../forge/app-icon): no page CSS at favicon paint, so colors are
// RED's own dark-scheme token VALUES baked flat — no var(), no gradients, no filters —
// on RED's dark backdrop.
//
// The ICON cut is the ring ALONE (../red/mark-geometry): the chrome mark's enclosed
// R/E/D collapses to a ~3.5px blur at 16px, so the icon keeps the shape and surrenders
// the name. `press-yellow` (the brighter crimson) rather than `yellow`: at a 16px tab
// icon the ring is a 1px line, and it has to survive it.
const { "press-yellow": ring, backdrop } = redTokens.dark;

/** The backdrop must fill the padded box the ICON stroke needs, not the bare mark box. */
const [x, y, w, h] = ICON.viewBox.split(" ");

export const redAppIcon =
  `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="${ICON.viewBox}" role="img" aria-label="RED">` +
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${backdrop}"/>` +
  `<g fill="none" stroke-linecap="butt">` +
  `<path d="${RING_TOP}" stroke="${ring}" stroke-width="${ICON.ring}"/>` +
  `<path d="${RING_BOT}" stroke="${ring}" stroke-width="${ICON.ring}"/>` +
  `</g>` +
  `</svg>`;
