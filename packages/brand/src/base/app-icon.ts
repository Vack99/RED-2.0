import { BASE_TILE, BASE_TILE_HALVES } from "./logo";
import { baseTokens } from "./tokens";

// The neutral base module's self-contained app icon (served by the dynamic /icon
// favicon route). Same contract as Forge's/RED's (../forge/app-icon): a favicon
// paints WITHOUT page CSS, so colors are base's own dark-scheme token VALUES baked
// flat, and geometry is the single source BASE_TILE + BASE_TILE_HALVES — no second
// copy of the tile numbers. The diagonal split is a static clipPath (SVG structure,
// not page CSS, so it renders standalone).
const { yellow, gold, backdrop } = baseTokens.dark;
const { x, y, size, radius } = BASE_TILE;

export const baseAppIcon =
  `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" role="img" aria-label="Gimnasio">` +
  `<rect width="100" height="100" fill="${backdrop}"/>` +
  `<defs><clipPath id="base-tile"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}"/></clipPath></defs>` +
  `<g clip-path="url(#base-tile)">` +
  BASE_TILE_HALVES.map(
    (half) => `<polygon points="${half.points}" fill="${half.accent === "gold" ? gold : yellow}"/>`,
  ).join("") +
  `</g></svg>`;
