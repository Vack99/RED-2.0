import { describe, expect, it } from "vitest";

import { fmtEyebrow, fmtMesAnio } from "./date";

// Fixed date: Wed 27 May 2026 (months are 0-based).
const HOY = new Date(2026, 4, 27);

describe("fmtEyebrow", () => {
  it("formats the greeting eyebrow with the year", () => {
    expect(fmtEyebrow(HOY)).toBe("MIÉ · 27 MAY 2026");
  });
});

describe("fmtMesAnio", () => {
  it("formats the uppercased month + year", () => {
    expect(fmtMesAnio(HOY)).toBe("MAYO 2026");
  });
});
