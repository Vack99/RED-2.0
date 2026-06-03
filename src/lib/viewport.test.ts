import { describe, expect, it } from "vitest";

import { keyboardInset } from "./viewport";

describe("keyboardInset", () => {
  it("is 0 when the visual viewport fills the layout viewport (no keyboard)", () => {
    expect(keyboardInset(800, { height: 800, offsetTop: 0 })).toBe(0);
  });

  it("equals the height the keyboard steals from the bottom", () => {
    expect(keyboardInset(800, { height: 480, offsetTop: 0 })).toBe(320);
  });

  it("accounts for a non-zero visual-viewport offsetTop", () => {
    expect(keyboardInset(800, { height: 480, offsetTop: 20 })).toBe(300);
  });

  it("never returns a negative inset (e.g. transient over-report)", () => {
    expect(keyboardInset(800, { height: 820, offsetTop: 0 })).toBe(0);
  });
});
