// ── SINGLE SOURCE OF TRUTH for the F-mark geometry ──────────────────────────
// The F-mark is three slanted bars (silver / gold crossbar / silver stub) whose
// LEFT edges are collinear on a single "/" diagonal — that shared left margin is
// the "F" spine. Bars step down in length (~100% / 74% / 40%) and end in a sharp
// right-leaning point, so the negative space reads as an "F". (Geometry matched
// to the real Forge Bootcamp logo.)
//
// EVERY surface that draws the mark derives its polygons from this ONE definition
// and can never drift: the static `FMark` + `ForgeLockup` (`./logo`), the animated
// bar-build `ForgeIgnitionMark` (`./ignition-mark`), and the flat favicon
// (`./app-icon`). It lives in its OWN leaf module — importing only nothing — so
// the logo (which now renders the ignition on `animate`) and the ignition (which
// needs this geometry) share it without a circular import. This is Forge's brand
// module in @gym/brand — keep it free of any app / @gym/data / @gym/domain dep.
//
// Both edges lean left at the bottom ("/"): the left edge gently (the shared
// spine), the right edge steeper so each bar ends in a sharp forward point.
export const FMARK_LEFT_SLANT = -3.4;
export const FMARK_RIGHT_SLANT = -6;
export const FMARK_BAR_HEIGHT = 12;

/** SVG `points` string for one bar, given its top-left x, top-right x, top y. */
export function bar(xL: number, xR: number, yTop: number): string {
  return (
    `${xL},${yTop} ${xR},${yTop} ` +
    `${xR + FMARK_RIGHT_SLANT},${yTop + FMARK_BAR_HEIGHT} ` +
    `${xL + FMARK_LEFT_SLANT},${yTop + FMARK_BAR_HEIGHT}`
  );
}

/** Which metal gradient fills a bar (the mark is silver / gold / silver). */
export type FMarkBarRole = "silver" | "gold";

/** A single bar of the mark: its polygon points and its metal role. */
export interface FMarkBar {
  /** Stable identifier (top → middle → bottom). */
  readonly name: "top" | "middle" | "bottom";
  /** SVG polygon `points` for this bar. */
  readonly points: string;
  /** Which metal gradient fills it. */
  readonly role: FMarkBarRole;
}

/**
 * The three bars in draw order (top → middle → bottom), silver / gold / silver.
 * THIS is the canonical geometry. FMark, the ignition mark, and the app icon all
 * consume this array — there is no second copy of the polygon numbers.
 */
export const FMARK_BARS: readonly FMarkBar[] = [
  { name: "top", points: bar(30, 92, 18), role: "silver" },
  { name: "middle", points: bar(23.7, 69.7, 40), role: "gold" },
  { name: "bottom", points: bar(17.4, 42.4, 62), role: "silver" },
];
