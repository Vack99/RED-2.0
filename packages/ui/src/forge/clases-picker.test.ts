import { describe, expect, it } from "vitest";

import { OPTIONS, ROW_H, indexOf, rowAt } from "./clases-picker";

/**
 * Pure-logic tests for the picker's index↔row math, extracted so it is testable
 * without simulating the DOM/scroll. The stops are 1..30 then `null` (Ilimitado)
 * as the final row; the index IS the scroll row, and rowAt rounds scrollTop to
 * the snap pitch (ROW_H) and clamps. No rendering happens on import.
 */
describe("OPTIONS", () => {
  it("has 31 stops: 1..30 then null", () => {
    expect(OPTIONS).toHaveLength(31);
    expect(OPTIONS[0]).toBe(1);
    expect(OPTIONS[29]).toBe(30);
    expect(OPTIONS[OPTIONS.length - 1]).toBeNull();
  });
});

describe("indexOf", () => {
  it("maps null (Ilimitado) to the last row", () => {
    expect(indexOf(null)).toBe(30);
  });
  it("maps 1 to the first row and 30 to the last numeric row", () => {
    expect(indexOf(1)).toBe(0);
    expect(indexOf(30)).toBe(29);
  });
  it("clamps out-of-range values to a valid row", () => {
    expect(indexOf(0)).toBe(0); // below the floor → first row
    expect(indexOf(-5)).toBe(0);
    expect(indexOf(99)).toBe(30); // above the ceiling → last row
  });
});

describe("rowAt", () => {
  it("maps an exact snap offset to its row", () => {
    expect(rowAt(0)).toBe(0);
    expect(rowAt(5 * ROW_H)).toBe(5);
    expect(rowAt(30 * ROW_H)).toBe(30);
  });
  it("rounds a mid-scroll offset to the nearest row", () => {
    expect(rowAt(ROW_H * 0.4)).toBe(0); // <½ row → stays
    expect(rowAt(ROW_H * 0.6)).toBe(1); // >½ row → advances
    expect(rowAt(ROW_H * 2.5)).toBe(3); // .5 rounds up (Math.round)
  });
  it("clamps below 0 and above the last row", () => {
    expect(rowAt(-100)).toBe(0);
    expect(rowAt(999 * ROW_H)).toBe(30);
  });
});
