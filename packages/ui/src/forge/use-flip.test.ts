import { describe, expect, it } from "vitest";

import { flipDelta, isMeasurableDelta } from "./use-flip";

describe("flipDelta", () => {
  it("is zero when the element did not move", () => {
    expect(flipDelta({ x: 10, y: 20 }, { x: 10, y: 20 })).toEqual({ dx: 0, dy: 0 });
  });

  it("inverts the move: the delta points from the new position back to the old", () => {
    // The row used to be at y=100 and is now at y=300. To make it *look* like it
    // is still at the old spot, we translate it up by 200 (old − new).
    expect(flipDelta({ x: 0, y: 100 }, { x: 0, y: 300 })).toEqual({ dx: 0, dy: -200 });
  });

  it("handles a move toward the top of the list (positive dy)", () => {
    expect(flipDelta({ x: 0, y: 400 }, { x: 0, y: 150 })).toEqual({ dx: 0, dy: 250 });
  });

  it("captures horizontal movement too", () => {
    expect(flipDelta({ x: 80, y: 0 }, { x: 20, y: 0 })).toEqual({ dx: 60, dy: 0 });
  });
});

describe("isMeasurableDelta", () => {
  it("is false for a zero delta (nothing to animate)", () => {
    expect(isMeasurableDelta({ dx: 0, dy: 0 })).toBe(false);
  });

  it("is false for sub-pixel jitter below the threshold", () => {
    expect(isMeasurableDelta({ dx: 0.4, dy: -0.3 })).toBe(false);
  });

  it("is true once movement crosses one pixel on either axis", () => {
    expect(isMeasurableDelta({ dx: 0, dy: 2 })).toBe(true);
    expect(isMeasurableDelta({ dx: -3, dy: 0 })).toBe(true);
  });
});
