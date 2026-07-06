import { redTokens } from "./tokens";

// RED's self-contained app icon (served by the dynamic /icon favicon route). Same
// contract as Forge's (../forge/app-icon): no page CSS at favicon paint, so colors
// are RED's own dark-scheme token VALUES baked flat (no var()/gradients/filters),
// and the geometry is the broken neon ring — two crimson arcs (r=597, gaps at the
// sides), base stroke + a brighter inner highlight, on RED's dark backdrop.
const { yellow, "press-yellow": highlight, backdrop } = redTokens.dark;

const RING_TOP = "M77.5 378.7 A597 597 0 0 1 1176.5 378.7";
const RING_BOT = "M1176.5 845.3 A597 597 0 0 1 77.5 845.3";

export const redAppIcon =
  `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 1254 1254" role="img" aria-label="RED">` +
  `<rect width="1254" height="1254" fill="${backdrop}"/>` +
  `<g fill="none" stroke-linecap="butt">` +
  `<path d="${RING_TOP}" stroke="${yellow}" stroke-width="74"/>` +
  `<path d="${RING_BOT}" stroke="${yellow}" stroke-width="74"/>` +
  `<path d="${RING_TOP}" stroke="${highlight}" stroke-width="22"/>` +
  `<path d="${RING_BOT}" stroke="${highlight}" stroke-width="22"/>` +
  `</g>` +
  `</svg>`;
