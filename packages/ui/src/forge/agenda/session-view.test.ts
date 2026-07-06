import { describe, expect, it } from "vitest";

import { countLabel, estadoVisual, occupancyPct } from "./session-view";

/**
 * Pure presentation logic for a session's derived state. `EstadoSesion` arrives
 * already-derived (S4 domain owns the booked/cap/now math); these helpers only
 * map it to brand-contract tokens + labels, so the agenda card / week row /
 * quick-glance sheet all read one source for the session palette.
 */
describe("estadoVisual", () => {
  it("normal (disponible) shows no status badge and a neutral bar", () => {
    const v = estadoVisual("normal");
    expect(v.statusLabel).toBeNull();
    expect(v.dimmed).toBe(false);
    expect(v.barToken).toBe("var(--muted-soft)");
    expect(v.dotToken).toBe("var(--muted-soft)");
  });
  it("casi_lleno reads accent (yellow) with the 'Casi lleno' badge", () => {
    const v = estadoVisual("casi_lleno");
    expect(v.statusLabel).toBe("Casi lleno");
    expect(v.statusToken).toBe("var(--yellow)");
    expect(v.barToken).toBe("var(--yellow)");
    expect(v.dimmed).toBe(false);
  });
  it("lleno reads red with the 'Lleno' badge", () => {
    const v = estadoVisual("lleno");
    expect(v.statusLabel).toBe("Lleno");
    expect(v.statusToken).toBe("var(--red)");
    expect(v.barToken).toBe("var(--red)");
  });
  it("termino dims and reads 'Terminó' in muted", () => {
    const v = estadoVisual("termino");
    expect(v.statusLabel).toBe("Terminó");
    expect(v.dimmed).toBe(true);
    expect(v.barToken).toBe("var(--line)");
    expect(v.dotToken).toBe("var(--line)");
  });
});

describe("occupancyPct", () => {
  it("is booked/cap rounded to a whole percent", () => {
    expect(occupancyPct(18, 24)).toBe(75);
    expect(occupancyPct(19, 24)).toBe(79);
  });
  it("clamps a full/over class to 100 and guards cap 0", () => {
    expect(occupancyPct(24, 24)).toBe(100);
    expect(occupancyPct(30, 24)).toBe(100);
    expect(occupancyPct(5, 0)).toBe(0);
  });
});

describe("countLabel", () => {
  it("renders 'booked / cap'", () => {
    expect(countLabel(18, 20)).toBe("18 / 20");
  });
});
