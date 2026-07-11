import { FMARK_BARS } from "./mark-geometry";
import { forgeTokens } from "./tokens";

// Forge's self-contained app icon (the dynamic /icon favicon route serves this).
// A favicon renders WITHOUT page CSS, so — unlike the in-app FMark — it cannot use
// `var(--…)` or gradients: colors are the brand's own dark-scheme token VALUES,
// baked flat once at module load. Geometry is the single source FMARK_BARS
// (grill lock (h)) mapped to polygons — no second copy of the mark numbers.
const { silver, yellow, backdrop } = forgeTokens.dark;

// The shared bar() geometry yields floating-point coordinates (e.g. 14 arrives as
// 13.999…); trim them to keep the shipped favicon markup clean without a second
// copy of the numbers.
const tidy = (points: string) => points.replace(/-?\d+\.\d+/g, (n) => String(Math.round(+n * 100) / 100));

export const forgeAppIcon =
  `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" role="img" aria-label="FORGE">` +
  `<rect width="100" height="100" fill="${backdrop}"/>` +
  `<g transform="translate(50 50) scale(0.92) translate(-53 -46)">` +
  FMARK_BARS.map(
    (b) => `<polygon points="${tidy(b.points)}" fill="${b.role === "gold" ? yellow : silver}"/>`,
  ).join("") +
  `</g></svg>`;
