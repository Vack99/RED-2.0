import { describe, expect, it } from "vitest";

import { etiquetaSesion, nombreSesion, railAccent, serieTag, topTag } from "./session-card";

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

describe("nombreSesion — a class's plain title (#328 prefactor)", () => {
  it("an especial names itself", () => {
    expect(nombreSesion("Functional", { isSpecial: true, specialName: "Open box" })).toBe("Open box");
  });
  it("an unnamed especial reads 'Especial'", () => {
    expect(nombreSesion("Functional", { isSpecial: true, specialName: "  " })).toBe("Especial");
    expect(nombreSesion("Functional", { isSpecial: true })).toBe("Especial");
  });
  it("an ordinary class reads its tipo", () => {
    expect(nombreSesion("Functional", { isSpecial: false })).toBe("Functional");
  });
});

describe("etiquetaSesion — the same ladder, lifted from a DTO's shape", () => {
  it("an especial DTO names itself", () => {
    expect(etiquetaSesion({ tipo: "Functional", esEspecial: true, nombreEspecial: "Open box" })).toBe(
      "Open box",
    );
  });
  it("an unnamed especial DTO reads 'Especial'", () => {
    expect(etiquetaSesion({ tipo: "Functional", esEspecial: true, nombreEspecial: null })).toBe(
      "Especial",
    );
  });
  it("an ordinary DTO reads its tipo", () => {
    expect(etiquetaSesion({ tipo: "Functional", esEspecial: false, nombreEspecial: null })).toBe(
      "Functional",
    );
  });
});

/**
 * The series tag badges the EXCEPTION (#243). This is the whole rule, and it is
 * inverted on purpose: a gym runs ~21 repeating schedules, so tagging the repeating
 * class would put a glyph on ~100% of cards and say nothing. The lone class is news.
 */
describe("serieTag", () => {
  it("badges a class with no rule behind it", () => {
    expect(serieTag(true)).toBe("Única");
  });
  it("says nothing for a generated class — the majority carries no information", () => {
    expect(serieTag(false)).toBeNull();
  });
});
