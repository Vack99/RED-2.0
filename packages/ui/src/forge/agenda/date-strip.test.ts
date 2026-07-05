import { describe, expect, it } from "vitest";

import { clampDrag, isHorizontalSwipe, swipeCommits } from "./date-strip";

/**
 * Pointer-drag intent + commit math for the swipeable date strip, generalized
 * from the app's swipe util: a drag reads as horizontal once it clears a small
 * intent threshold and beats vertical movement; it commits a day step past a
 * larger threshold; the live translate is clamped so the strip never runs away.
 */
describe("isHorizontalSwipe", () => {
  it("ignores sub-threshold jitter", () => {
    expect(isHorizontalSwipe(4, 0)).toBe(false);
  });
  it("reads a clear horizontal drag", () => {
    expect(isHorizontalSwipe(20, 3)).toBe(true);
  });
  it("defers to a mostly-vertical drag (page scroll wins)", () => {
    expect(isHorizontalSwipe(10, 14)).toBe(false);
  });
});

describe("swipeCommits", () => {
  it("commits past the commit threshold", () => {
    expect(swipeCommits(60)).toBe(true);
    expect(swipeCommits(-60)).toBe(true);
  });
  it("snaps back below it", () => {
    expect(swipeCommits(30)).toBe(false);
  });
});

describe("clampDrag", () => {
  it("passes through a small drag", () => {
    expect(clampDrag(25)).toBe(25);
  });
  it("clamps a large drag to the rail width", () => {
    expect(clampDrag(200)).toBe(70);
    expect(clampDrag(-200)).toBe(-70);
  });
});
