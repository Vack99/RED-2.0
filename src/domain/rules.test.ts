import { describe, it, expect } from "vitest";
import { calcVigenciaEnd, diasRestantes, stackPaquete } from "./rules";

describe("stackPaquete", () => {
  it("adds classes and days onto the current package (brief Q5)", () => {
    expect(stackPaquete({ clases: 5, dias: 3 }, { clases: 8, dias: 20 })).toEqual({
      clases: 13,
      dias: 23,
    });
  });

  it("keeps classes ilimitado when the current package is ilimitado", () => {
    expect(
      stackPaquete({ clases: "ilimitado", dias: 10 }, { clases: 8, dias: 20 }),
    ).toEqual({ clases: "ilimitado", dias: 30 });
  });

  it("keeps classes ilimitado when the new package is ilimitado", () => {
    expect(
      stackPaquete({ clases: 5, dias: 3 }, { clases: "ilimitado", dias: 30 }),
    ).toEqual({ clases: "ilimitado", dias: 33 });
  });

  it("keeps classes ilimitado when both packages are ilimitado", () => {
    expect(
      stackPaquete({ clases: "ilimitado", dias: 10 }, { clases: "ilimitado", dias: 20 }),
    ).toEqual({ clases: "ilimitado", dias: 30 });
  });
});

describe("calcVigenciaEnd", () => {
  it("adds fixed days for an 8-class package (20 días)", () => {
    const end = calcVigenciaEnd(new Date(2026, 4, 13), 20); // 13 may
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 5, 2]); // 2 jun
  });

  it("adds fixed days for a 12-class package (25 días)", () => {
    const end = calcVigenciaEnd(new Date(2026, 4, 13), 25);
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 5, 7]); // 7 jun
  });

  it("runs Ilimitado to the last day of the purchase month (brief Q1)", () => {
    const end = calcVigenciaEnd(new Date(2026, 4, 13), "mes");
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 4, 31]); // 31 may
  });

  it("runs Ilimitado to Dec 31 (year stays the same)", () => {
    const end = calcVigenciaEnd(new Date(2026, 11, 5), "mes"); // 5 dic
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 11, 31]);
  });

  it("handles month-end for a short non-leap February", () => {
    const end = calcVigenciaEnd(new Date(2026, 1, 15), "mes");
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 1, 28]);
  });
});

describe("diasRestantes", () => {
  it("counts whole days until vence", () => {
    expect(diasRestantes(new Date(2026, 4, 30), new Date(2026, 4, 27))).toBe(3);
  });
  it("is 0 on the vence day", () => {
    expect(diasRestantes(new Date(2026, 4, 27), new Date(2026, 4, 27))).toBe(0);
  });
  it("is negative once expired", () => {
    expect(diasRestantes(new Date(2026, 4, 25), new Date(2026, 4, 27))).toBe(-2);
  });
});
