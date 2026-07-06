import { describe, expect, it } from "vitest";

import { railAccent, topTag } from "./session-card";

/**
 * The card's two accent axes are independent of the occupancy `estado`:
 * the rail lights for the next-upcoming OR a special session, and the top tag
 * is "A continuación" for the next one, else the special's name.
 */
describe("railAccent", () => {
  it("lights for the next-upcoming session", () => {
    expect(railAccent({ isNext: true, isSpecial: false })).toBe(true);
  });
  it("lights for a special session", () => {
    expect(railAccent({ isNext: false, isSpecial: true })).toBe(true);
  });
  it("stays dark for an ordinary session", () => {
    expect(railAccent({ isNext: false, isSpecial: false })).toBe(false);
  });
});

describe("topTag", () => {
  it("prefers 'A continuación' for the next session", () => {
    expect(topTag({ isNext: true, isSpecial: true, specialName: "Noche de Fuerza" })).toBe("A continuación");
  });
  it("shows the special name when not next", () => {
    expect(topTag({ isNext: false, isSpecial: true, specialName: "Noche de Fuerza" })).toBe("Noche de Fuerza");
  });
  it("falls back to 'Especial' for an unnamed special", () => {
    expect(topTag({ isNext: false, isSpecial: true, specialName: "" })).toBe("Especial");
  });
  it("is null for an ordinary session", () => {
    expect(topTag({ isNext: false, isSpecial: false })).toBeNull();
  });
});
