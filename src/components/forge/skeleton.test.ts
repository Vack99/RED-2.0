import { describe, expect, it } from "vitest";

import { skeletonStyle } from "./skeleton";

// The component itself is a server-renderable presentational primitive (no
// hooks). The only branching logic is how variant + props resolve to a box
// size, so that is what we pin here — pure values, no DOM, no CSS assertions.
describe("skeletonStyle", () => {
  it("defaults a plain block to full width, a 16px line, square corners", () => {
    expect(skeletonStyle({})).toEqual({ width: "100%", height: 16, borderRadius: 0 });
  });

  it("treats explicit width/height numbers as px and passes a radius through", () => {
    expect(skeletonStyle({ width: 120, height: 24, radius: 4 })).toEqual({
      width: 120,
      height: 24,
      borderRadius: 4,
    });
  });

  it("circle: mirrors width into height and forces a pill radius", () => {
    expect(skeletonStyle({ circle: true, width: 68 })).toEqual({
      width: 68,
      height: 68,
      borderRadius: 999,
    });
  });

  it("circle ignores an explicit height (stays a square) and an explicit radius", () => {
    expect(skeletonStyle({ circle: true, width: 40, height: 10, radius: 4 })).toEqual({
      width: 40,
      height: 40,
      borderRadius: 999,
    });
  });

  it("text: short default line height + full width", () => {
    expect(skeletonStyle({ text: true })).toEqual({ width: "100%", height: 12, borderRadius: 0 });
  });

  it("passes string lengths through untouched (%, rem, …)", () => {
    expect(skeletonStyle({ width: "60%", height: "2rem" })).toEqual({
      width: "60%",
      height: "2rem",
      borderRadius: 0,
    });
  });
});
