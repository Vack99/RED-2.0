import { RED_CHEVRONS } from "./logo";
import { redTokens } from "./tokens";

// RED's self-contained app icon (served by the dynamic /icon favicon route). Same
// contract as Forge's (../forge/app-icon): no page CSS at favicon paint, so colors
// are RED's own dark-scheme token VALUES baked flat, and geometry is the single
// source RED_CHEVRONS (grill lock (h)) — the lead chevron carries the accent, the
// trailing one silver, on RED's dark backdrop.
const { yellow, silver, backdrop } = redTokens.dark;

export const redAppIcon =
  `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" role="img" aria-label="RED">` +
  `<rect width="100" height="100" fill="${backdrop}"/>` +
  RED_CHEVRONS.map(
    (c) => `<polygon points="${c.points}" fill="${c.lead ? yellow : silver}"/>`,
  ).join("") +
  `</svg>`;
