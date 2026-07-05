import { describe, expect, it } from "vitest";

import { WHEEL_ITEM_H, wheelIndexOf, wheelRowAt } from "./wheel-picker";

/**
 * Pure index↔row math for the 40px / 200px scroll-snap wheel, generalized from
 * the clases-picker pattern. The index IS the scroll row; rowAt rounds scrollTop
 * to the item pitch and clamps to a valid row.
 */
describe("wheelRowAt", () => {
  it("maps an exact snap offset to its row", () => {
    expect(wheelRowAt(0, 5)).toBe(0);
    expect(wheelRowAt(2 * WHEEL_ITEM_H, 5)).toBe(2);
  });
  it("rounds a mid-scroll offset to the nearest row", () => {
    expect(wheelRowAt(WHEEL_ITEM_H * 0.4, 5)).toBe(0);
    expect(wheelRowAt(WHEEL_ITEM_H * 0.6, 5)).toBe(1);
  });
  it("clamps below zero and above the last row", () => {
    expect(wheelRowAt(-100, 5)).toBe(0);
    expect(wheelRowAt(999 * WHEEL_ITEM_H, 5)).toBe(4);
  });
});

describe("wheelIndexOf", () => {
  it("finds the row of the current value", () => {
    expect(wheelIndexOf(["05:00", "05:15", "05:30"], "05:15")).toBe(1);
    expect(wheelIndexOf([30, 45, 60], 60)).toBe(2);
  });
  it("falls back to the first row for an absent value", () => {
    expect(wheelIndexOf([30, 45, 60], 999)).toBe(0);
  });
});
