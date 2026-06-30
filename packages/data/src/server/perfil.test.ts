import { describe, expect, it } from "vitest";

import { resolverIdentidad } from "./perfil";

describe("resolverIdentidad", () => {
  it("falls blanks back to the defaults (FORGE / Coach / null)", () => {
    expect(resolverIdentidad({ negocio: null, coach: null, ciudad: null })).toEqual({
      negocio: "FORGE",
      coach: "Coach",
      ciudad: null,
    });
    expect(resolverIdentidad({ negocio: "  ", coach: "  ", ciudad: "  " })).toEqual({
      negocio: "FORGE",
      coach: "Coach",
      ciudad: null,
    });
  });

  it("trims real values", () => {
    expect(resolverIdentidad({ negocio: "  Forge Bootcamp ", coach: " JC ", ciudad: " Chihuahua " })).toEqual({
      negocio: "Forge Bootcamp",
      coach: "JC",
      ciudad: "Chihuahua",
    });
  });

  it("passes real values through unchanged", () => {
    expect(resolverIdentidad({ negocio: "FORGE", coach: "Juan", ciudad: "Chihuahua" })).toEqual({
      negocio: "FORGE",
      coach: "Juan",
      ciudad: "Chihuahua",
    });
  });
});
