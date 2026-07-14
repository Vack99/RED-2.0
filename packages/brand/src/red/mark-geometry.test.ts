import { describe, expect, it } from "vitest";

import { redAppIcon } from "./app-icon";
import { CHROME, HERO, ICON, LETTERS, RING_BOT, RING_TOP } from "./mark-geometry";

/**
 * The shipped chrome mark drew the ring at stroke 74 inside the bare `0 0 1254 1254`
 * box. Half of that stroke overhangs the arc's apex, so the mark was sliced flat at
 * the top in every size it rendered at — for months, silently, because a clipped SVG
 * throws nothing. A cut's stroke and its viewBox are one decision; this is the guard
 * that says so.
 */

/** `M x1 y1 A r r rot large sweep x2 y2` → the numbers, in path order. */
function arc(d: string) {
  const [x1, y1, r, , , , , x2] = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  return { x1, y1, r, x2 };
}

/** The apex of a circular arc drawn on a horizontal chord, bulging away from `y`. */
function apex(d: string, bulge: "up" | "down"): number {
  const { x1, y1, r, x2 } = arc(d);
  const half = Math.abs(x2 - x1) / 2;
  const toCenter = Math.sqrt(r * r - half * half);
  // Bulging up puts the center BELOW the chord, and vice versa.
  return bulge === "up" ? y1 + toCenter - r : y1 - toCenter + r;
}

function box(viewBox: string) {
  const [minX, minY, w, h] = viewBox.split(" ").map(Number);
  return { minX, minY, maxX: minX + w, maxY: minY + h };
}

const APEX_TOP = apex(RING_TOP, "up");
const APEX_BOT = apex(RING_BOT, "down");

/** The wordmark's own extent, from the letter paths themselves. */
const letterXs = LETTERS.flatMap((l) => l.d).flatMap((d) => d.match(/[MHLC] ?(-?\d+(?:\.\d+)?)/g) ?? []);

describe("the RED mark's optical cuts", () => {
  it("the arcs apex where the drift bug said they did", () => {
    expect(APEX_TOP).toBeCloseTo(15.1, 1);
    expect(APEX_BOT).toBeCloseTo(1208.9, 1);
    // The letters exist and are shared, so no cut can quietly drop the wordmark.
    expect(LETTERS.map((l) => l.cls)).toEqual(["R", "E", "D"]);
    expect(letterXs.length).toBeGreaterThan(0);
  });

  it.each([
    ["HERO", HERO.viewBox, HERO.ring],
    ["CHROME", CHROME.viewBox, CHROME.ring],
    ["ICON", ICON.viewBox, ICON.ring],
  ])("%s's viewBox clears its own ring stroke — no clipped apex", (_cut, viewBox, ring) => {
    const { minY, maxY } = box(viewBox);
    // Half the stroke overhangs the centerline apex, top and bottom.
    expect(APEX_TOP - ring / 2).toBeGreaterThanOrEqual(minY);
    expect(APEX_BOT + ring / 2).toBeLessThanOrEqual(maxY);
  });

  it.each([
    ["HERO", HERO.viewBox, HERO.letters],
    ["CHROME", CHROME.viewBox, CHROME.letters],
  ])("%s's viewBox clears its own letter strokes", (_cut, viewBox, letters) => {
    const { minX, maxX, minY, maxY } = box(viewBox);
    const half = letters / 2;
    // The wordmark's drawn extent: x 72 (the R's stem) → 1199 (the D's bowl),
    // y 478 → 746, shifted down 27 by LETTERS_SHIFT.
    expect(72 - half).toBeGreaterThanOrEqual(minX);
    expect(1199 + half).toBeLessThanOrEqual(maxX);
    expect(478 + 27 - half).toBeGreaterThanOrEqual(minY);
    expect(746 + 27 + half).toBeLessThanOrEqual(maxY);
  });

  it("the ICON cut is the ring alone, and the favicon paints with no page CSS", () => {
    // A favicon renders with none of the app's stylesheets loaded, so a var() would
    // resolve to nothing and a filter/gradient is needless risk at 16px.
    expect(redAppIcon).toContain("<svg");
    expect(redAppIcon).toContain(ICON.viewBox);
    expect(redAppIcon).not.toContain("var(");
    expect(redAppIcon).not.toContain("Gradient");
    expect(redAppIcon).not.toContain("filter");
    // Ring only: the chrome letters collapse to a blur at 16px.
    expect(redAppIcon).not.toContain(LETTERS[0].d[0]);
    expect(redAppIcon).toContain(RING_TOP);
    expect(redAppIcon).toContain(RING_BOT);
  });

  it("the backdrop fills the padded icon box, not the bare mark box", () => {
    // The ICON cut pads its viewBox to clear a stroke-80 ring; a 0 0 1254 1254 rect
    // would leave the padding transparent and the tab icon would show gaps.
    const { minX, minY } = box(ICON.viewBox);
    expect(redAppIcon).toContain(`x="${minX}" y="${minY}"`);
  });
});
