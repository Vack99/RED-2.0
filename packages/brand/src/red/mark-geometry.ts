// THIS is the canonical RED geometry — a BROKEN neon ring (two arcs, gaps at the
// sides) enclosing a stroked R/E/D wordmark, the mock's `redLogoSVG`. The ignited
// hero (./ring-mark), the chrome mark (./logo) and the app icon (./app-icon) all
// consume it; there is no second copy of the numbers. Mirrors ../forge/mark-geometry.
//
// Until this file existed the paths were pasted into all three, and they drifted:
// the chrome mark had quietly become a DIFFERENT drawing — the ring fattened to
// stroke 74 and the R/E/D deleted outright, with a wordmark set in the app's UI font
// bolted on beside it. It read as another brand, and it was clipped besides (below).
//
// THE OVERHANG. The arcs ride r=597 about (627, 612), so their CENTERLINES apex at
// y≈15.1 (top) and y≈1208.9 (bottom). Half of whatever stroke a caller picks
// overhangs those apexes, so the bare `0 0 1254 1254` box fits a hairline and
// nothing else: at stroke 74 the ring overshot the top by 21.9 units and was sliced
// flat there in every size it shipped at. A stroke weight is therefore inseparable
// from the box that clears it — so the two travel together, as one CUT.

export const RING_TOP = "M77.5 378.7 A597 597 0 0 1 1176.5 378.7";
export const RING_BOT = "M1176.5 845.3 A597 597 0 0 1 77.5 845.3";

/** The wordmark, drawn as strokes: the letter's `d`s + its ignition-flick delay (s). */
export const LETTERS: readonly {
  readonly cls: string;
  readonly delay: number;
  readonly d: readonly string[];
}[] = [
  {
    cls: "R",
    delay: 1.18,
    d: [
      "M72 478 V746",
      "M72 478 H266 C311 478 343 502 343 544 C343 580 328 608 296 625 C257 640 230 633 204 624",
      "M210 626 L324 742",
    ],
  },
  { cls: "E", delay: 1.46, d: ["M510 478 H767", "M510 612 H767", "M510 746 H767"] },
  {
    cls: "D",
    delay: 1.72,
    d: [
      "M919 478 V746",
      "M919 485 H1049 C1132 485 1199 541 1199 613 C1199 685 1132 741 1049 741 H919",
    ],
  },
];

/** The wordmark sits low in the ring. */
export const LETTERS_SHIFT = "translate(0 27)";

/**
 * The three OPTICAL CUTS of the one mark. Same paths at every size — only the
 * weights change, because a drawing tuned for 200px is not the same drawing at 26px:
 * HERO's 14-unit ring lands at a quarter of a pixel in the chrome and disappears.
 * Each cut carries the `viewBox` that clears its own stroke overhang (see above);
 * they are not interchangeable.
 */
export const HERO = {
  viewBox: "0 0 1254 1254",
  ring: 14,
  letters: 37,
  /** The inner neon-tube highlight — legible only at hero scale, dropped below it. */
  highlight: 5,
} as const;

/** App chrome (header, receipt, drawer): the logo itself, re-cut so the wordmark still reads. */
export const CHROME = {
  viewBox: "14 -1 1226 1226",
  ring: 32,
  letters: 64,
} as const;

/**
 * Favicon / app icon: the ring ALONE. Even CHROME's letters collapse to a ~3.5px
 * blur at 16px, so the icon carries the ring and surrenders the name.
 */
export const ICON = {
  viewBox: "-10 -25 1274 1274",
  ring: 80,
} as const;

/** The neon tube gradients. Vertical (`userSpaceOnUse`), so they need the mark's own axis. */
export const RING_GRADIENT = {
  x: 627,
  y1: 30,
  y2: 1224,
  stops: [
    { offset: "0", color: "#d92b1f" },
    { offset: ".5", color: "#c8161c" },
    { offset: "1", color: "#8f1014" },
  ],
} as const;

export const BODY_GRADIENT = {
  x: 0,
  y1: 478,
  y2: 773,
  stops: [
    { offset: "0", color: "#e23222" },
    { offset: ".35", color: "#c8161c" },
    { offset: "1", color: "#7e0d10" },
  ],
} as const;

/**
 * The chrome mark's glow, scaled to the size it renders at. A fixed blur radius is
 * what kills a shrunken neon sign — HERO's 16px outer shadow is wider than the whole
 * mark at 16px, so the letters drown in their own halo.
 */
export const chromeGlow = (size: number) => `drop-shadow(0 0 ${(size * 0.1).toFixed(2)}px #c8161c)`;
