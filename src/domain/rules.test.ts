import { describe, it, expect } from "vitest";
import { stackPaquete } from "./rules";

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
});
