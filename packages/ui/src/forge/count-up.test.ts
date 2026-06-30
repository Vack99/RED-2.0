import { describe, expect, it } from "vitest";

import { countUpStep } from "./count-up";

describe("countUpStep", () => {
  it("starts at `from` when progress is 0", () => {
    expect(countUpStep(0, 100, 0)).toBe(0);
    expect(countUpStep(40, 100, 0)).toBe(40);
  });

  it("lands exactly on `to` when progress is 1", () => {
    expect(countUpStep(0, 100, 1)).toBe(100);
    expect(countUpStep(40, 100, 1)).toBe(100);
  });

  it("clamps progress below 0 and above 1", () => {
    expect(countUpStep(0, 100, -0.5)).toBe(0);
    expect(countUpStep(0, 100, 2)).toBe(100);
  });

  it("eases out — past the halfway value by the time progress is halfway", () => {
    // Ease-out cubic at t=0.5 is 1 - 0.5^3 = 0.875, so 87.5 → rounds to 88.
    expect(countUpStep(0, 100, 0.5)).toBe(88);
  });

  it("returns rounded integers in between", () => {
    const v = countUpStep(0, 10, 0.3);
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(10);
  });

  it("counts down when `to` is below `from`", () => {
    expect(countUpStep(100, 0, 0)).toBe(100);
    expect(countUpStep(100, 0, 1)).toBe(0);
    expect(countUpStep(100, 0, 0.5)).toBe(13); // 100 - 87.5 = 12.5 → 13
  });
});
