import { describe, expect, it } from "vitest";

import { resolverIdentidad } from "./perfil";

// The negocio fallback is now INJECTED by the caller (the operator's gym brand —
// gym.brand_name, #97), never a hard-coded platform default. A neutral value here
// proves the injected fallback flows through; coach/ciudad keep their own defaults.
const FALLBACK = "Mi Gym";

describe("resolverIdentidad", () => {
  it("falls blanks back to the injected negocio + the coach/null defaults", () => {
    expect(resolverIdentidad({ negocio: null, coach: null, ciudad: null }, FALLBACK)).toEqual({
      negocio: "Mi Gym",
      coach: "Coach",
      ciudad: null,
    });
    expect(resolverIdentidad({ negocio: "  ", coach: "  ", ciudad: "  " }, FALLBACK)).toEqual({
      negocio: "Mi Gym",
      coach: "Coach",
      ciudad: null,
    });
  });

  it("trims real values", () => {
    expect(
      resolverIdentidad({ negocio: "  Forge Bootcamp ", coach: " JC ", ciudad: " Chihuahua " }, FALLBACK),
    ).toEqual({
      negocio: "Forge Bootcamp",
      coach: "JC",
      ciudad: "Chihuahua",
    });
  });

  it("passes real values through unchanged (never reaching the injected fallback)", () => {
    expect(resolverIdentidad({ negocio: "RED", coach: "Juan", ciudad: "Chihuahua" }, FALLBACK)).toEqual({
      negocio: "RED",
      coach: "Juan",
      ciudad: "Chihuahua",
    });
  });
});
