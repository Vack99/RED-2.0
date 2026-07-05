import { describe, expect, it } from "vitest";

import { disponibilidadColor, disponibilidadLine } from "./quick-glance-sheet";

/**
 * The quick-glance sheet reads "greener" than the card: a healthy class shows a
 * green availability line (the card's bar for the same class is neutral), so the
 * sheet owns its own estado→copy + estado→color mapping.
 */
describe("disponibilidadLine", () => {
  it("announces a terminated class", () => {
    expect(disponibilidadLine("termino", 4)).toBe("La clase terminó");
  });
  it("announces a full class", () => {
    expect(disponibilidadLine("lleno", 0)).toBe("Clase llena · sin lugares");
  });
  it("counts the last few singular/plural", () => {
    expect(disponibilidadLine("casi_lleno", 1)).toBe("Solo 1 lugar libre");
    expect(disponibilidadLine("casi_lleno", 3)).toBe("Solo 3 lugares libres");
  });
  it("reports the free count when there is room", () => {
    expect(disponibilidadLine("normal", 8)).toBe("8 lugares libres");
  });
});

describe("disponibilidadColor", () => {
  it("is green for a healthy class, red when full, muted when done", () => {
    expect(disponibilidadColor("normal")).toBe("var(--green)");
    expect(disponibilidadColor("casi_lleno")).toBe("var(--yellow)");
    expect(disponibilidadColor("lleno")).toBe("var(--red)");
    expect(disponibilidadColor("termino")).toBe("var(--muted-soft)");
  });
});
